import {
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
  FastifyError
} from 'fastify'
import { AppError, normalizeError } from './error-types.js'
import { FastifyBaseLogger } from 'fastify'

function formatStackTrace(stack?: string): string {
  if (!stack) return 'No stack trace available'

  return stack
    .split('\n')
    .slice(0, 50)
    .map((line) => line.trim())
    .join('\n')
}

function logError(logger: FastifyBaseLogger, error: AppError): void {
  const errorDetails = {
    name: error.name,
    message: error.message,
    statusCode: error.statusCode,
    isOperational: error.isOperational,
    stack: formatStackTrace(error.stack),
    context: error.context || {}
  }

  if (error.cause) {
    errorDetails.context = {
      ...errorDetails.context,
      cause: {
        name: error.cause.name,
        message: error.cause.message,
        stack: formatStackTrace(error.cause.stack)
      }
    }
  }

  if (error.statusCode >= 500) {
    logger.error(errorDetails, `[${error.name}] ${error.message}`)
  } else if (error.statusCode >= 400) {
    logger.warn(errorDetails, `[${error.name}] ${error.message}`)
  } else {
    logger.info(errorDetails, `[${error.name}] ${error.message}`)
  }
}

function formatErrorResponse(
  error: AppError,
  isDevelopment: boolean
): Record<string, unknown> {
  const baseResponse = {
    error: error.name,
    message: error.message,
    statusCode: error.statusCode
  }

  if (isDevelopment) {
    return {
      ...baseResponse,
      stack: error.stack,
      isOperational: error.isOperational,
      context: error.context,
      cause: error.cause
        ? {
            name: error.cause.name,
            message: error.cause.message,
            stack: error.cause.stack
          }
        : undefined
    }
  }

  return baseResponse
}

export function registerErrorHandlers(fastify: FastifyInstance): void {
  const isDevelopment = fastify.config.NODE_ENV !== 'production'

  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const error = new AppError(
      `Route ${request.method}:${request.url} not found`,
      404,
      true
    )
    logError(fastify.log, error)
    reply.status(404).send(formatErrorResponse(error, isDevelopment))
  })

  fastify.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const appError = normalizeError(error)

      logError(fastify.log, appError)

      const clientError =
        appError.statusCode >= 500 && !isDevelopment
          ? new AppError('Internal Server Error', 500, true)
          : appError

      reply
        .status(appError.statusCode)
        .send(formatErrorResponse(clientError, isDevelopment))
    }
  )

  process.on('uncaughtException', (error: Error) => {
    const appError = normalizeError(error)
    logError(fastify.log, appError)

    if (!appError.isOperational && fastify.config.NODE_ENV === 'production') {
      console.error('FATAL: Non-operational error occurred. Exiting process.')
      process.exit(1)
    }
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const appError = normalizeError(reason)
    logError(fastify.log, appError)

    if (!appError.isOperational && fastify.config.NODE_ENV === 'production') {
      console.error('FATAL: Unhandled promise rejection. Exiting process.')
      process.exit(1)
    }
  })

  fastify.log.info('Global error handlers registered')
}
