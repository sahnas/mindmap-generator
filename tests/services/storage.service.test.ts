import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'
import { MindMap } from '../../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'
import { StorageServiceError } from '../../src/errors/error-types.js'

interface MockedFile {
  name?: string
  save: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
}
interface MockedBucket {
  exists: ReturnType<typeof vi.fn>
  file: (name: string) => MockedFile
  getFiles: ReturnType<typeof vi.fn>
}
interface MockedStorage {
  bucket: ReturnType<typeof vi.fn>
  createBucket: ReturnType<typeof vi.fn>
}

vi.mock('@google-cloud/storage', async () => {
  const mockDownloadFn = vi.fn()
  const mockSaveFn = vi.fn()
  const mockFileFn = vi.fn().mockImplementation(
    (name: string): MockedFile => ({
      name: name,
      save: mockSaveFn,
      download: mockDownloadFn
    })
  )
  const mockExistsFn = vi.fn().mockResolvedValue([true])
  const mockGetFilesFn = vi.fn().mockResolvedValue([[], null, {}])
  const mockBucket: MockedBucket = {
    exists: mockExistsFn,
    file: mockFileFn,
    getFiles: mockGetFilesFn
  }
  const mockCreateBucketFn = vi.fn().mockResolvedValue([mockBucket])
  const mockBucketFn = vi.fn().mockReturnValue(mockBucket)
  const mockStorage: MockedStorage = {
    bucket: mockBucketFn,
    createBucket: mockCreateBucketFn
  }
  const MockStorageConstructor = vi.fn().mockImplementation(() => mockStorage)
  return { Storage: MockStorageConstructor }
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
    let mockedBucket: MockedBucket
    let mockedStorage: MockedStorage

    beforeEach(async () => {
      const { Storage: MockedStorageConstructor } = await import(
        '@google-cloud/storage'
      )
      mockedStorage = new MockedStorageConstructor() as unknown as MockedStorage
      mockedBucket = mockedStorage.bucket(testBucketName) as MockedBucket

      vi.mocked(mockedBucket.exists).mockReset()
      vi.mocked(mockedStorage.createBucket).mockReset()
    })

    it('should create a bucket if it does not exist', async () => {
      vi.mocked(mockedBucket.exists).mockResolvedValueOnce([false])
      vi.mocked(mockedStorage.createBucket).mockResolvedValueOnce(
        mockedBucket as unknown as [MockedBucket]
      )

      await storageService.initBucket()

      expect(mockedBucket.exists).toHaveBeenCalledTimes(1)
      expect(mockedStorage.createBucket).toHaveBeenCalledTimes(1)
      expect(mockedStorage.createBucket).toHaveBeenCalledWith(testBucketName)
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Bucket ${testBucketName} created.`
      )
    })

    it('should not create a bucket if it already exists', async () => {
      vi.mocked(mockedBucket.exists).mockResolvedValueOnce([true])

      await storageService.initBucket()

      expect(mockedBucket.exists).toHaveBeenCalledTimes(1)
      expect(mockedStorage.createBucket).not.toHaveBeenCalled()
    })

    it('should handle errors properly', async () => {
      const error = new Error('Init failed')
      vi.mocked(mockedBucket.exists).mockRejectedValueOnce(error)

      await expect(storageService.initBucket()).rejects.toThrow(
        StorageServiceError
      )

      await expect(storageService.initBucket()).rejects.toThrow(
        /Failed to initialize GCS bucket/
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing bucket:',
        error
      )
    })
  })

  describe('storeMindMap', () => {
    it('should store a mind map and return the file name', async () => {
      const testMindMap: MindMap = {
        id: 'test-id',
        subject: 'Test Subject',
        topic: 'Test Topic',
        root: { id: 'root-id', text: 'Root Topic' },
        createdAt: '2023-01-01T00:00:00.000Z'
      }
      const expectedFileName = 'Test_Subject_Test_Topic_test-id.json'

      const { Storage: MockedStorageConstructor } = await import(
        '@google-cloud/storage'
      )
      const mockedStorageLocal =
        new MockedStorageConstructor() as unknown as MockedStorage
      const mockedBucketLocal = mockedStorageLocal.bucket(
        testBucketName
      ) as MockedBucket
      const mockedFile = mockedBucketLocal.file(expectedFileName)
      vi.mocked(mockedFile.save)
        .mockReset()
        .mockResolvedValueOnce(undefined as void)

      const result = await storageService.storeMindMap(testMindMap)

      expect(result).toBe(expectedFileName)
      expect(mockedBucketLocal.file).toHaveBeenCalledWith(expectedFileName)
      expect(vi.mocked(mockedFile.save)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockedFile.save)).toHaveBeenCalledWith(
        JSON.stringify(testMindMap, null, 2),
        {
          contentType: 'application/json',
          metadata: { subject: testMindMap.subject, topic: testMindMap.topic }
        }
      )
    })

    it('should handle errors properly', async () => {
      const testMindMap: MindMap = {
        id: 'test-id',
        subject: 'Test Subject',
        topic: 'Test Topic',
        root: { id: 'root-id', text: 'Root Topic' },
        createdAt: '2023-01-01T00:00:00.000Z'
      }
      const expectedFileName = 'Test_Subject_Test_Topic_test-id.json'

      const { Storage: MockedStorageConstructor } = await import(
        '@google-cloud/storage'
      )
      const mockedStorageLocal =
        new MockedStorageConstructor() as unknown as MockedStorage
      const mockedBucketLocal = mockedStorageLocal.bucket(
        testBucketName
      ) as MockedBucket
      const mockedFile = mockedBucketLocal.file(expectedFileName)
      const mockedSave = vi.mocked(mockedFile.save)
      mockedSave.mockReset()

      const error = new Error('Save failed')
      mockedSave.mockRejectedValueOnce(error)

      await expect(storageService.storeMindMap(testMindMap)).rejects.toThrow(
        StorageServiceError
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error storing mind map:',
        error
      )
      expect(mockedBucketLocal.file).toHaveBeenCalledWith(expectedFileName)
      expect(mockedSave).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAllMindMaps', () => {
    let mockedBucket: MockedBucket
    let mockedGetFiles: ReturnType<typeof vi.fn>

    const createMockFileObject = (
      id: string,
      subject: string,
      topic: string
    ): MockedFile => {
      const mindMap: MindMap = {
        id: `id-${id}`,
        subject,
        topic,
        root: { id: `root-${id}`, text: `Root ${id}` },
        createdAt: '2023-01-01T00:00:00.000Z'
      }
      return {
        name: `${subject}_${topic}_${id}.json`,
        download: vi
          .fn()
          .mockResolvedValue([Buffer.from(JSON.stringify(mindMap))]),
        save: vi.fn().mockResolvedValue(undefined as void)
      }
    }

    beforeEach(async () => {
      const { Storage: MockedStorageConstructor } = await import(
        '@google-cloud/storage'
      )
      const mockedStorageLocal =
        new MockedStorageConstructor() as unknown as MockedStorage
      mockedBucket = mockedStorageLocal.bucket(testBucketName) as MockedBucket
      mockedGetFiles = vi.mocked(mockedBucket.getFiles)
      mockedGetFiles.mockReset()
    })

    it('should retrieve the first page of mind maps', async () => {
      const mockFile = createMockFileObject('1', 'Sub1', 'Top1')
      mockedGetFiles.mockResolvedValueOnce([
        [mockFile],
        { pageToken: 'next-page-token' },
        {}
      ])

      const limit = 1
      const result = await storageService.getAllMindMaps(undefined, limit)

      expect(result.mindMaps.length).toBe(1)
      expect(result.mindMaps[0].id).toBe('id-1')
      expect(result.nextPageToken).toBe('next-page-token')
      expect(mockedGetFiles).toHaveBeenCalledTimes(1)
      expect(mockedGetFiles).toHaveBeenCalledWith({
        maxResults: limit,
        pageToken: undefined,
        autoPaginate: false
      })
      expect(vi.mocked(mockFile.download)).toHaveBeenCalledTimes(1)
    })

    it('should retrieve a subsequent page using pageToken', async () => {
      const mockFile2 = createMockFileObject('2', 'Sub2', 'Top2')
      mockedGetFiles.mockResolvedValueOnce([
        [mockFile2],
        { pageToken: 'tokenForPage3' },
        {}
      ])

      const limit = 1
      const pageTokenInput = 'tokenForPage2'
      const result = await storageService.getAllMindMaps(pageTokenInput, limit)

      expect(result.mindMaps.length).toBe(1)
      expect(result.mindMaps[0].id).toBe('id-2')
      expect(result.nextPageToken).toBe('tokenForPage3')
      expect(mockedGetFiles).toHaveBeenCalledTimes(1)
      expect(mockedGetFiles).toHaveBeenCalledWith({
        maxResults: limit,
        pageToken: pageTokenInput,
        autoPaginate: false
      })
      expect(vi.mocked(mockFile2.download)).toHaveBeenCalledTimes(1)
    })

    it('should handle individual download errors gracefully', async () => {
      const mockFile1 = createMockFileObject('1', 'Good', 'File1')
      const mockFileCorrupt = createMockFileObject('2', 'Corrupt', 'File2')
      const mockFile3 = createMockFileObject('3', 'Good', 'File3')
      const downloadError = new Error('Download failed')
      vi.mocked(mockFileCorrupt.download).mockRejectedValueOnce(downloadError)

      mockedGetFiles.mockResolvedValueOnce([
        [mockFile1, mockFileCorrupt, mockFile3],
        null,
        {}
      ])

      const limit = 3
      const result = await storageService.getAllMindMaps(undefined, limit)

      expect(result.mindMaps.length).toBe(2)
      expect(result.mindMaps.map((m) => m.id)).toEqual(['id-1', 'id-3'])
      expect(result.nextPageToken).toBeUndefined()
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Failed to download or parse file ${mockFileCorrupt.name}:`,
        downloadError
      )
      expect(vi.mocked(mockFile1.download)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockFileCorrupt.download)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(mockFile3.download)).toHaveBeenCalledTimes(1)
      expect(mockedGetFiles).toHaveBeenCalledTimes(1)
    })

    it('should return empty result if no files exist', async () => {
      mockedGetFiles.mockResolvedValueOnce([[], null, {}])

      const result = await storageService.getAllMindMaps()

      expect(result).toEqual({ mindMaps: [], nextPageToken: undefined })
      expect(mockedGetFiles).toHaveBeenCalledTimes(1)
      expect(mockedGetFiles).toHaveBeenCalledWith({
        maxResults: 100,
        pageToken: undefined,
        autoPaginate: false
      })
    })

    it('should handle listing errors properly', async () => {
      const error = new Error('Test GCS list error')
      mockedGetFiles.mockRejectedValueOnce(error)

      await expect(storageService.getAllMindMaps()).rejects.toThrow(
        StorageServiceError
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error retrieving mind maps list from GCS:',
        error
      )
      expect(mockedGetFiles).toHaveBeenCalledTimes(1)
    })
  })
})
