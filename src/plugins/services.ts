import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import MindMapService from '../services/mind-map.service.js'
import { CSVService } from '../services/csv.service.js'
import OpenAIService from '../services/openai.service.js'
import { IMindMapGenerator } from '../interfaces/mindmap-generator.interface.js'
import StorageFactory from '../services/storage-factory.service.js'
import { IStorageService } from '../types/index.js'
import { Config } from './config.js'
import { Storage } from '@google-cloud/storage'

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
  const config = fastify.config as Config

  let storage: Storage | undefined
  if (!config.storage.useLocalStorage) {
    storage = new Storage({
      projectId: config.storage.gcp.projectId,
      keyFilename: config.storage.gcp.keyFilename
    })
  }

  const csvService = new CSVService(storage, fastify.log)
  const storageService: IStorageService = StorageFactory.createStorageService(
    config.storage.useLocalStorage,
    {
      gcpProjectId: config.storage.gcp.projectId,
      gcpBucketName: config.storage.gcp.bucketName,
      gcpKeyFilename: config.storage.gcp.keyFilename,
      localStoragePath: config.storage.local.storagePath
    },
    fastify.log
  )

  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY must be defined in .env')
  }
  const mindMapGenerator: IMindMapGenerator = new OpenAIService(
    config.openai.apiKey,
    fastify.log
  )
  fastify.log.info('Using OpenAI as the mind map generator.')

  const mindMapService = new MindMapService(
    csvService,
    mindMapGenerator,
    storageService,
    fastify.log
  )

  try {
    await mindMapService.init()
    fastify.log.info('MindMap service initialized successfully')
  } catch (error) {
    fastify.log.error('Failed to initialize MindMap service:', error)
    throw error
  }

  fastify.decorate('mindMapService', mindMapService)
}

declare module 'fastify' {
  interface FastifyInstance {
    mindMapService: MindMapService
  }
}

export default fp(servicesPlugin)
