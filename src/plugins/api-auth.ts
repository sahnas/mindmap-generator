import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { AppError } from '../errors/error-types.js'
import crypto from 'crypto'

declare module 'fastify' {
  interface FastifyRequest {
    validateApiKey(): void
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify) => {
  if (!fastify.config.API_KEY || fastify.config.API_KEY.length < 8) {
    fastify.log.warn('API_KEY NOT CONFIGURED OR TOO SHORT')
  }

  fastify.decorateRequest('validateApiKey', function (this: FastifyRequest) {
    const isDebugMode = process.env.NODE_ENV === 'development'
    if (!fastify.config.API_KEY || fastify.config.API_KEY.length < 8) {
      if (isDebugMode) {
        fastify.log.debug(
          'API authentication disabled - no valid API_KEY configured'
        )
      }
      return
    }

    const apiKey = this.headers['x-api-key']

    if (!apiKey) {
      throw new AppError('API key missing', 401, true)
    }

    try {
      const apiKeyString = Array.isArray(apiKey) ? apiKey[0] : apiKey
      const apiKeyBuffer = Buffer.from(apiKeyString)
      const configKeyBuffer = Buffer.from(fastify.config.API_KEY)

      if (apiKeyBuffer.length !== configKeyBuffer.length) {
        throw new AppError('Invalid API key', 403, true)
      }

      const isValid = crypto.timingSafeEqual(apiKeyBuffer, configKeyBuffer)
      if (!isValid) {
        throw new AppError('Invalid API key', 403, true)
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('Invalid API key', 403, true)
    }

    if (isDebugMode) {
      fastify.log.debug('API key validation successful')
    }
  })

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/' || request.url.startsWith('/public')) {
      return
    }

    try {
      request.validateApiKey()
    } catch (error) {
      reply.code(error instanceof AppError ? error.statusCode : 401)
      return reply.send({
        error: error instanceof Error ? error.message : 'Authentication error'
      })
    }
  })
}

export default fp(authPlugin)
