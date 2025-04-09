export class AppError extends Error {
  public statusCode: number

  public isOperational: boolean

  public cause?: Error

  public context?: Record<string, unknown>

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.cause = cause
    this.context = context

    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public errors?: unknown[],
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 400, true, cause, context)
    this.errors = errors
  }
}

export class NotFoundError extends AppError {
  constructor(
    resource: string,
    identifier?: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    const message = `Resource ${resource}${identifier ? ` with identifier ${identifier}` : ''} not found`
    super(message, 404, true, cause, context)
  }
}

export class ExternalAPIError extends AppError {
  constructor(
    service: string,
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(`${service} API Error: ${message}`, 502, true, cause, context)
  }
}

export class FileSystemError extends AppError {
  constructor(
    operation: string,
    path: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `File system operation ${operation} failed for path: ${path}`,
      500,
      true,
      cause,
      context
    )
  }
}

export class TimeoutError extends AppError {
  constructor(
    operation: string,
    timeoutMs: number,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Operation ${operation} timed out after ${timeoutMs}ms`,
      408,
      true,
      cause,
      context
    )
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }

  if (error instanceof Error) {
    return new AppError(error.message, 500, false, error)
  }

  const message = error ? String(error) : 'Unknown error'
  return new AppError(message, 500, false)
}

export class StorageServiceError extends AppError {
  constructor(
    operation: string,
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Storage operation '${operation}' failed: ${message}`,
      500,
      true,
      cause,
      context
    )
  }
}

export class StorageError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'StorageError'
  }
}
