import { IStorageService } from '../types/index.js'
import StorageService from './storage.service.js'
import LocalStorageService from './local-storage.service.js'
import { FastifyBaseLogger } from 'fastify'

/**
 * Factory pour créer le service de stockage approprié
 */
export class StorageFactory {
  /**
   * Crée une instance du service de stockage en fonction de la configuration
   *
   * @param useLocalStorage - Utiliser le stockage local ou GCP
   * @param options - Options de configuration
   * @param logger - Logger Fastify optionnel
   * @returns Service de stockage implémentant IStorageService
   */
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
