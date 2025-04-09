import { FastifyPluginAsync } from 'fastify'
import mindMapsRoutes from './mindmaps.js'
import { RootResponseSchema } from '../schemas/index.js'

const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(mindMapsRoutes, { prefix: '/api/v1' })

  fastify.get('/', {
    schema: {
      response: {
        200: RootResponseSchema
      }
    },
    handler: async () => {
      return {
        status: 'ok',
        message: 'Mind Map Generator API is running'
      }
    }
  })
}

export default routes
