import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import MindMapService from '../services/mind-map.service.js'
import { CSVService } from '../services/csv.service.js'
import OpenAIService from '../services/openai.service.js'
import StorageFactory from '../services/storage-factory.service.js'

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
  const { config } = fastify

  const csvService = new CSVService(fastify.log)
  const openaiService = new OpenAIService(config.openai.apiKey, fastify.log)
  const storageService = StorageFactory.createStorageService(
    config.storage.useLocalStorage,
    {
      gcpProjectId: config.storage.gcp.projectId,
      gcpBucketName: config.storage.gcp.bucketName,
      gcpKeyFilename: config.storage.gcp.keyFilename,
      localStoragePath: config.storage.local.storagePath
    },
    fastify.log
  )

  const mindMapService = new MindMapService(
    csvService,
    openaiService,
    storageService,
    fastify.log
  )

  try {
    await mindMapService.init()
    fastify.log.info('MindMap service initialized successfully')
  } catch (error) {
    fastify.log.error('Failed to initialize MindMap service:', error)
  }

  fastify.decorate('mindMapService', mindMapService)
}

declare module 'fastify' {
  interface FastifyInstance {
    mindMapService: MindMapService
  }
}

export default fp(servicesPlugin)
