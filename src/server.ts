import fastify from 'fastify'
import config from './plugins/config.js'
import auth from './plugins/api-auth.js'
import routes from './routes/index.js'
import servicesPlugin from './plugins/services.js'
import { registerErrorHandlers } from './errors/error-handler.js'
import rateLimit from '@fastify/rate-limit'

const server = fastify({
  ajv: {
    customOptions: {
      removeAdditional: 'all',
      coerceTypes: true,
      useDefaults: true
    }
  },
  logger: {
    level: process.env.LOG_LEVEL
  }
})

await server.register(config)
await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
})

await server.register(auth)
await server.register(servicesPlugin)
await server.register(routes)

registerErrorHandlers(server)

await server.ready()

export default server
