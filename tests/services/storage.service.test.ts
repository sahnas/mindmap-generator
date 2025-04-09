import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'
import { MindMap } from '../../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'

interface MockedStorage {
  bucket: ReturnType<typeof vi.fn>
  createBucket: ReturnType<typeof vi.fn>
}

interface MockedBucket {
  exists: ReturnType<typeof vi.fn>
  file: ReturnType<typeof vi.fn>
  getFiles: ReturnType<typeof vi.fn>
}

interface MockedFile {
  name?: string
  save: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
}

vi.mock('@google-cloud/storage', () => {
  // Setup mock file
  const mockFile: MockedFile = {
    save: vi.fn().mockResolvedValue([{}]),
    download: vi
      .fn()
      .mockResolvedValue([Buffer.from(JSON.stringify({ id: 'test-id' }))])
  }

  const mockBucket: MockedBucket = {
    exists: vi.fn().mockResolvedValue([true]),
    file: vi.fn().mockReturnValue(mockFile),
    getFiles: vi.fn().mockResolvedValue([[]])
  }

  const createBucketFn = vi.fn().mockResolvedValue([{}])
  const bucketFn = vi.fn().mockReturnValue(mockBucket)

  const MockStorage = vi.fn().mockImplementation(() => ({
    bucket: bucketFn,
    createBucket: createBucketFn
  }))

  return {
    Storage: MockStorage
  }
})

describe('StorageService', () => {
  let storageService: StorageService
  const testProjectId = 'test-project'
  const testBucketName = 'test-bucket'

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnValue({} as FastifyBaseLogger),
    level: 'info',
    silent: false
  } as unknown as FastifyBaseLogger

  beforeEach(() => {
    vi.clearAllMocks()
    storageService = new StorageService(
      testProjectId,
      testBucketName,
      undefined,
      mockLogger
    )
  })

  describe('initBucket', () => {
    it('should create a bucket if it does not exist', async () => {
      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      mockedBucket.exists.mockResolvedValueOnce([false])

      await storageService.initBucket()

      expect(mockedBucket.exists).toHaveBeenCalled()
      expect(mockedStorage.createBucket).toHaveBeenCalledWith(testBucketName)
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should not create a bucket if it already exists', async () => {
      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      mockedBucket.exists.mockResolvedValueOnce([true])

      await storageService.initBucket()

      expect(mockedBucket.exists).toHaveBeenCalled()
      expect(mockedStorage.createBucket).not.toHaveBeenCalled()
    })

    it('should handle errors properly', async () => {
      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      const error = new Error('Test error')
      mockedBucket.exists.mockRejectedValueOnce(error)

      await expect(storageService.initBucket()).rejects.toThrow('Test error')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('storeMindMap', () => {
    it('should store a mind map and return the file name', async () => {
      const testMindMap: MindMap = {
        id: 'test-id',
        subject: 'Test Subject',
        topic: 'Test Topic',
        root: {
          id: 'root-id',
          text: 'Root Topic'
        },
        createdAt: '2023-01-01T00:00:00.000Z'
      }

      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket
      const expectedFileName = 'Test_Subject_Test_Topic_test-id.json'
      const mockedFile = mockedBucket.file(
        expectedFileName
      ) as unknown as MockedFile

      const result = await storageService.storeMindMap(testMindMap)

      expect(result).toBe(expectedFileName)
      expect(mockedBucket.file).toHaveBeenCalledWith(expectedFileName)
      expect(mockedFile.save).toHaveBeenCalledWith(
        JSON.stringify(testMindMap, null, 2),
        {
          contentType: 'application/json',
          metadata: {
            subject: testMindMap.subject,
            topic: testMindMap.topic
          }
        }
      )
    })

    it('should handle errors properly', async () => {
      const testMindMap: MindMap = {
        id: 'test-id',
        subject: 'Test Subject',
        topic: 'Test Topic',
        root: {
          id: 'root-id',
          text: 'Root Topic'
        },
        createdAt: '2023-01-01T00:00:00.000Z'
      }

      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket
      const expectedFileName = 'Test_Subject_Test_Topic_test-id.json'
      const mockedFile = mockedBucket.file(
        expectedFileName
      ) as unknown as MockedFile

      const error = new Error('Test error')
      mockedFile.save.mockRejectedValueOnce(error)

      await expect(storageService.storeMindMap(testMindMap)).rejects.toThrow(
        'Test error'
      )
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('getAllMindMaps', () => {
    it('should retrieve paginated mind maps', async () => {
      const mockMindMaps = [
        {
          id: 'id-1',
          subject: 'Subject 1',
          topic: 'Topic 1',
          root: { id: 'root-1', text: 'Root 1' },
          createdAt: '2023-01-01T00:00:00.000Z'
        },
        {
          id: 'id-2',
          subject: 'Subject 2',
          topic: 'Topic 2',
          root: { id: 'root-2', text: 'Root 2' },
          createdAt: '2023-01-02T00:00:00.000Z'
        }
      ]

      const mockFiles = [
        {
          name: 'file1.json',
          download: vi
            .fn()
            .mockResolvedValue([Buffer.from(JSON.stringify(mockMindMaps[0]))])
        },
        {
          name: 'file2.json',
          download: vi
            .fn()
            .mockResolvedValue([Buffer.from(JSON.stringify(mockMindMaps[1]))])
        }
      ]

      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      mockedBucket.getFiles.mockResolvedValueOnce([mockFiles])

      const result = await storageService.getAllMindMaps(0, 1)

      expect(result).toEqual({
        mindMaps: [mockMindMaps[0]],
        total: 2,
        hasMore: true
      })
      expect(mockedBucket.getFiles).toHaveBeenCalled()
      expect(mockFiles[0].download).toHaveBeenCalled()
      expect(mockFiles[1].download).not.toHaveBeenCalled()
    })

    it('should return empty result if no files exist', async () => {
      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      mockedBucket.getFiles.mockResolvedValueOnce([[]])

      const result = await storageService.getAllMindMaps()

      expect(result).toEqual({
        mindMaps: [],
        total: 0,
        hasMore: false
      })
    })

    it('should handle errors properly', async () => {
      const { Storage } = await import('@google-cloud/storage')

      const mockedStorage = new Storage() as unknown as MockedStorage
      const mockedBucket = mockedStorage.bucket(
        testBucketName
      ) as unknown as MockedBucket

      const error = new Error('Test error')
      mockedBucket.getFiles.mockRejectedValueOnce(error)

      await expect(storageService.getAllMindMaps()).rejects.toThrow(
        'Test error'
      )
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
