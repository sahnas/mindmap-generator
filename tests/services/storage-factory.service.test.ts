import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageFactory } from '../../src/services/storage-factory.service.js'
import { FastifyBaseLogger } from 'fastify'

vi.mock('../../src/services/local-storage.service.js', () => {
  const LocalStorageService = vi.fn()
  return {
    LocalStorageService,
    default: LocalStorageService
  }
})

vi.mock('../../src/services/storage.service.js', () => {
  const StorageService = vi.fn()
  return {
    StorageService,
    default: StorageService
  }
})

import { LocalStorageService } from '../../src/services/local-storage.service.js'
import { StorageService } from '../../src/services/storage.service.js'

describe('StorageFactory', () => {
  let mockLogger: Partial<FastifyBaseLogger>

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    vi.clearAllMocks()
  })

  describe('createStorageService', () => {
    it('should create a LocalStorageService when useLocalStorage is true', () => {
      const localStoragePath = './custom/path'

      const service = StorageFactory.createStorageService(
        true,
        { localStoragePath },
        mockLogger as FastifyBaseLogger
      )

      expect(LocalStorageService).toHaveBeenCalledWith(
        localStoragePath,
        mockLogger
      )
      expect(service).toBeDefined()
      expect(StorageService).not.toHaveBeenCalled()
    })

    it('should use default local storage path when not provided', () => {
      const service = StorageFactory.createStorageService(
        true,
        {},
        mockLogger as FastifyBaseLogger
      )

      expect(LocalStorageService).toHaveBeenCalledWith(
        './data/mindmaps',
        mockLogger
      )
      expect(service).toBeDefined()
    })

    it('should create a StorageService when useLocalStorage is false', () => {
      const gcpProjectId = 'test-project'
      const gcpBucketName = 'test-bucket'
      const gcpKeyFilename = 'test-key.json'

      const service = StorageFactory.createStorageService(
        false,
        { gcpProjectId, gcpBucketName, gcpKeyFilename },
        mockLogger as FastifyBaseLogger
      )

      expect(StorageService).toHaveBeenCalledWith(
        gcpProjectId,
        gcpBucketName,
        gcpKeyFilename,
        mockLogger
      )
      expect(service).toBeDefined()
      expect(LocalStorageService).not.toHaveBeenCalled()
    })

    it('should throw error when GCP config is missing and useLocalStorage is false', () => {
      expect(() => {
        StorageFactory.createStorageService(
          false,
          {},
          mockLogger as FastifyBaseLogger
        )
      }).toThrow(/GCP configuration missing/)
    })

    it('should throw error when projectId is missing', () => {
      expect(() => {
        StorageFactory.createStorageService(
          false,
          { gcpBucketName: 'test-bucket' },
          mockLogger as FastifyBaseLogger
        )
      }).toThrow(/GCP configuration missing/)
    })

    it('should throw error when bucketName is missing', () => {
      expect(() => {
        StorageFactory.createStorageService(
          false,
          { gcpProjectId: 'test-project' },
          mockLogger as FastifyBaseLogger
        )
      }).toThrow(/GCP configuration missing/)
    })
  })
})
