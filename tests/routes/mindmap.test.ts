import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify, { FastifyInstance, RawServerDefault } from 'fastify'
import { MindMapService } from '../../src/services/mind-map.service.js'
import { Config, NodeEnv } from '../../src/plugins/config.js'
import { CSVService } from '../../src/services/csv.service.js'
import { OpenAIService } from '../../src/services/openai.service.js'
import { LocalStorageService } from '../../src/services/local-storage.service.js'
import {
  ProcessingResult,
  PaginatedResponse,
  MindMap
} from '../../src/types/index.js'
import { Type } from '@sinclair/typebox'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true)
}))

describe('Mindmaps Routes', () => {
  let app: FastifyInstance<RawServerDefault>

  const mockGetAllMindMaps = vi.fn(
    (): Promise<PaginatedResponse> =>
      Promise.resolve({ mindMaps: [], total: 0, hasMore: false })
  )
  const mockProcessMindMaps = vi.fn(
    (): Promise<ProcessingResult[]> => Promise.resolve([])
  )

  const mockMindMapService = {
    csvService: new CSVService(),
    openaiService: new OpenAIService('mock-key'),
    storageService: new LocalStorageService('./data/mindmaps'),
    logger: console,
    init: vi.fn().mockResolvedValue(undefined),
    processMindMaps: mockProcessMindMaps,
    getAllMindMaps: mockGetAllMindMaps
  } as unknown as MindMapService

  beforeEach(async () => {
    vi.clearAllMocks()

    app = Fastify<RawServerDefault>({
      logger: {
        level: 'error'
      }
    })

    const { existsSync } = await import('fs')
    vi.mocked(existsSync).mockReset().mockReturnValue(true)

    app.decorate('mindMapService', mockMindMapService)

    const mockConfig: Config = {
      NODE_ENV: NodeEnv.development,
      LOG_LEVEL: 'error',
      API_HOST: 'localhost',
      API_PORT: '3000',
      OPENAI_API_KEY: 'mock-key',
      API_KEY: 'test_api_key_12345678',
      INPUT_CSV_PATH: './data/input.csv',
      OUTPUT_CSV_PATH: './data/output.csv',
      USE_LOCAL_STORAGE: 'true',
      LOCAL_STORAGE_PATH: './data/mindmaps',
      openai: { apiKey: 'mock-key' },
      storage: {
        useLocalStorage: true,
        local: { storagePath: './data/mindmaps' },
        gcp: {}
      },
      files: {
        inputCsvPath: './data/input.csv',
        outputCsvPath: './data/output.csv'
      }
    }
    app.decorate('config', mockConfig)

    app.get('/mindmaps', {
      schema: {
        response: {
          200: Type.Object({
            mindMaps: Type.Array(
              Type.Object({
                id: Type.String(),
                subject: Type.String(),
                topic: Type.String(),
                root: Type.Object({
                  id: Type.String(),
                  text: Type.String(),
                  children: Type.Array(Type.Any())
                }),
                createdAt: Type.String()
              })
            )
          })
        }
      },
      handler: async (_request, reply) => {
        try {
          const mindMaps = await app.mindMapService.getAllMindMaps()
          return { mindMaps: mindMaps.mindMaps }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'An unknown error occurred'
          reply.status(500).send({ error: errorMessage })
        }
      }
    })

    app.post('/mindmaps/generate', {
      schema: {
        body: Type.Object({
          inputCsvPath: Type.Optional(Type.String()),
          outputCsvPath: Type.Optional(Type.String())
        }),
        response: {
          200: Type.Object({
            results: Type.Array(
              Type.Object({
                topic: Type.String(),
                status: Type.String(),
                error: Type.Optional(Type.String())
              })
            )
          })
        }
      },
      handler: async (request, reply) => {
        try {
          const { inputCsvPath, outputCsvPath } = request.body as {
            inputCsvPath?: string
            outputCsvPath?: string
          }
          const inputPath = inputCsvPath || app.config.files.inputCsvPath
          const outputPath = outputCsvPath || app.config.files.outputCsvPath

          if (!existsSync(inputPath)) {
            return reply
              .status(400)
              .send({ error: `Input CSV file not found: ${inputPath}` })
          }

          const results = await app.mindMapService.processMindMaps(
            inputPath,
            outputPath
          )
          return { results }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'An unknown error occurred'
          reply.status(500).send({ error: errorMessage })
        }
      }
    })
  })

  describe('GET /mindmaps', () => {
    it('should return mind maps successfully', async () => {
      const mockMindMaps: MindMap[] = [
        {
          id: '1',
          subject: 'Math',
          topic: 'Algebra',
          root: { id: 'root1', text: 'Algebra', children: [] },
          createdAt: new Date().toISOString()
        }
      ]
      const mockResponse: PaginatedResponse = {
        mindMaps: mockMindMaps,
        total: 1,
        nextPageToken: undefined
      }
      mockGetAllMindMaps.mockResolvedValue(mockResponse)

      const response = await app.inject({
        method: 'GET',
        url: '/mindmaps'
      })

      console.log('GET response:', response.statusCode, response.json())

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ mindMaps: mockMindMaps })
      expect(mockGetAllMindMaps).toHaveBeenCalledWith()
    })

    it('should handle errors and return 500', async () => {
      mockGetAllMindMaps.mockRejectedValue(new Error('Database error'))

      const response = await app.inject({
        method: 'GET',
        url: '/mindmaps'
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ error: 'Database error' })
    })
  })

  describe('POST /mindmaps/generate', () => {
    it('should generate mind maps using default paths if none provided', async () => {
      const mockResults: ProcessingResult[] = [
        { topic: 'Algebra', status: 'Success' },
        { topic: 'Calculus', status: 'Failure', error: 'Processing error' }
      ]
      mockProcessMindMaps.mockResolvedValue(mockResults)

      const response = await app.inject({
        method: 'POST',
        url: '/mindmaps/generate',
        payload: {}
      })

      console.log(
        'POST default response:',
        response.statusCode,
        response.json()
      )

      expect(response.statusCode).toBe(200)
      expect(mockProcessMindMaps).toHaveBeenCalledWith(
        './data/input.csv',
        './data/output.csv'
      )
      expect(response.json()).toEqual({
        results: [
          { topic: 'Algebra', status: 'Success' },
          { topic: 'Calculus', status: 'Failure', error: 'Processing error' }
        ]
      })
    })

    it('should generate mind maps using custom paths when provided', async () => {
      const mockResults: ProcessingResult[] = [
        { topic: 'Algebra', status: 'Success' }
      ]
      mockProcessMindMaps.mockResolvedValue(mockResults)

      const customInputPath = './data/custom_input.csv'
      const customOutputPath = './data/custom_output.csv'

      const response = await app.inject({
        method: 'POST',
        url: '/mindmaps/generate',
        payload: {
          inputCsvPath: customInputPath,
          outputCsvPath: customOutputPath
        }
      })

      console.log('POST custom response:', response.statusCode, response.json())

      expect(response.statusCode).toBe(200)
      expect(mockProcessMindMaps).toHaveBeenCalledWith(
        customInputPath,
        customOutputPath
      )
      expect(response.json()).toEqual({
        results: [{ topic: 'Algebra', status: 'Success' }]
      })
    })

    it('should return 400 if input file does not exist', async () => {
      const { existsSync } = await import('fs')
      vi.mocked(existsSync).mockReturnValueOnce(false)

      const response = await app.inject({
        method: 'POST',
        url: '/mindmaps/generate',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({
        error: 'Input CSV file not found: ./data/input.csv'
      })
      expect(mockProcessMindMaps).not.toHaveBeenCalled()
    })

    it('should handle errors and return 500', async () => {
      mockProcessMindMaps.mockRejectedValue(new Error('Processing error'))

      const response = await app.inject({
        method: 'POST',
        url: '/mindmaps/generate',
        payload: {}
      })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ error: 'Processing error' })
    })
  })
})
