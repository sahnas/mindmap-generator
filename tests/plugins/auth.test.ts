import { describe, it, expect, beforeEach } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import configPlugin from '../../src/plugins/config.js'
import { authPlugin } from '../../src/plugins/api-auth.js'

describe('Auth Plugin', () => {
  let app: FastifyInstance
  const API_KEY = 'test_api_key_12345678'

  beforeEach(async () => {
    const originalEnv = { ...process.env }

    process.env.NODE_ENV = 'test'
    process.env.LOG_LEVEL = 'silent'
    process.env.API_HOST = 'localhost'
    process.env.API_PORT = '3000'
    process.env.API_KEY = API_KEY
    process.env.OPENAI_API_KEY = 'test_openai_key'

    app = Fastify({
      logger: { level: 'silent' }
    })

    await app.register(configPlugin)
    await app.register(authPlugin)

    app.get('/api/protected', async (request) => {
      request.validateApiKey()
      return { success: true }
    })

    app.get('/public/info', async () => {
      return { info: 'This is public' }
    })

    app.get('/', async () => {
      return { status: 'ok' }
    })

    return () => {
      process.env = originalEnv
    }
  })

  it('should allow access to public routes without API key', async () => {
    const publicRoutes = ['/', '/public/info']

    for (const route of publicRoutes) {
      const response = await app.inject({
        method: 'GET',
        url: route
      })

      expect(response.statusCode).toBe(200)
    }
  })

  it('should allow access to protected routes with valid API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: {
        'x-api-key': API_KEY
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true })
  })

  it('should deny access to protected routes without API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected'
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toHaveProperty('error')
  })

  it('should deny access to protected routes with invalid API key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: {
        'x-api-key': 'invalid_key'
      }
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toHaveProperty('error')
  })
})
