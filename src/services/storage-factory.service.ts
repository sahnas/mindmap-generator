import { IStorageService } from '../types/index.js'
import StorageService from './storage.service.js'
import LocalStorageService from './local-storage.service.js'
import { FastifyBaseLogger } from 'fastify'

export class StorageFactory {
  static createStorageService(
    useLocalStorage: boolean,
    options: {
      gcpProjectId?: string
      gcpBucketName?: string
      gcpKeyFilename?: string
      localStoragePath?: string
    },
    logger?: FastifyBaseLogger
  ): IStorageService {
    if (useLocalStorage) {
      return new LocalStorageService(
        options.localStoragePath ?? './data/mindmaps',
        logger
      )
    }

    const { gcpProjectId, gcpBucketName, gcpKeyFilename } = options
    if (!gcpProjectId || !gcpBucketName) {
      throw new Error(
        'GCP configuration missing: projectId and bucketName are required'
      )
    }

    return new StorageService(
      gcpProjectId,
      gcpBucketName,
      gcpKeyFilename,
      logger
    )
  }
}

export default StorageFactory
