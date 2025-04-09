import { existsSync } from 'fs'
import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import {
  MindMapsResponseSchema,
  GenerationRequestSchema,
  GenerationResponseSchema
} from '../schemas/index.js'

const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, default: 100 })),
  pageToken: Type.Optional(Type.String())
})

const mindMapsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/mindmaps', {
    schema: {
      querystring: PaginationQuerySchema,
      response: { 200: MindMapsResponseSchema }
    },
    handler: async (request, reply) => {
      try {
        const { limit, pageToken } = request.query as {
          limit?: number
          pageToken?: string
        }
        const response = await fastify.mindMapService.getAllMindMaps(
          pageToken,
          limit
        )
        return response
      } catch (error) {
        fastify.log.error('Error fetching mind maps:', error)
        reply.code(500).send({ error: 'Failed to retrieve mind maps' })
      }
    }
  })

  fastify.post('/mindmaps/generate', {
    schema: {
      body: GenerationRequestSchema,
      response: {
        200: GenerationResponseSchema,
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { inputCsvPath, outputCsvPath } = request.body as {
          inputCsvPath?: string
          outputCsvPath?: string
        }

        const inputPath = inputCsvPath || fastify.config.files.inputCsvPath
        const outputPath = outputCsvPath || fastify.config.files.outputCsvPath

        if (!existsSync(inputPath)) {
          reply
            .code(400)
            .send({ error: `Input CSV file not found: ${inputPath}` })
          return
        }

        const results = await fastify.mindMapService.processMindMaps(
          inputPath,
          outputPath
        )
        return {
          results: results.map((r) => ({
            ...r,
            filePath:
              r.status === 'Success'
                ? `${outputPath}/${r.topic}.json`
                : undefined
          }))
        }
      } catch (error) {
        fastify.log.error('Error generating mind maps:', error)
        reply.code(500).send({ error: 'Failed to generate mind maps' })
      }
    }
  })
}

export default mindMapsRoutes
