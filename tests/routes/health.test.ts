import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import routes from '../../src/routes/index.js'

describe('GET /', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await app.register(routes)
  })

  afterEach(async () => {
    await app.close()
  })

  it('Should return API status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    })
    expect(response.statusCode).eq(200)
    expect(response.json()).deep.eq({
      status: 'ok',
      message: 'Mind Map Generator API is running'
    })
  })
})
