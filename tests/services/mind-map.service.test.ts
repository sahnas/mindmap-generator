import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StorageService } from '../../src/services/storage.service.js'
import { CSVInputRow, IStorageService, MindMap } from '../../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'
import { StorageServiceError } from '../../src/errors/error-types.js'
import { CSVService } from '../../src/services/csv.service.js'
import MindMapService from '../../src/services/mind-map.service.js'
import OpenAIService from '../../src/services/openai.service.js'

const mockReadInputCSV = vi.fn()
const mockWriteOutputCSV = vi.fn().mockResolvedValue(undefined)
const mockGenerateMindMap = vi.fn()
const mockStoreMindMap = vi.fn().mockResolvedValue('some-file-name.json')
const mockInitBucket = vi.fn().mockResolvedValue(undefined)
const mockGetAllMindMaps = vi
  .fn()
  .mockResolvedValue({ mindMaps: [], nextPageToken: undefined })

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
  bucket: ReturnType<typeof vi.fn<(name: string) => MockedBucket>>
  createBucket: ReturnType<typeof vi.fn>
}
const mockDownloadFn = vi.fn()
const mockSaveFn = vi.fn()
const mockFileFn = vi.fn(
  (name: string): MockedFile => ({
    name: name,
    save: mockSaveFn,
    download: mockDownloadFn
  })
)
const mockExistsFn = vi.fn()
const mockGetFilesFn = vi.fn()
const mockCreateBucketFn = vi.fn()
const mockBucketInstance: MockedBucket = {
  exists: mockExistsFn,
  file: mockFileFn,
  getFiles: mockGetFilesFn
}
const mockBucketFn = vi.fn().mockReturnValue(mockBucketInstance)
mockCreateBucketFn.mockResolvedValue([mockBucketInstance])
const mockGCSStorageInstance: MockedStorage = {
  bucket: mockBucketFn,
  createBucket: mockCreateBucketFn
}
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => mockGCSStorageInstance)
}))

vi.mock('../../src/services/csv.service.js', () => ({
  CSVService: vi.fn().mockImplementation(() => ({
    readInputCSV: mockReadInputCSV,
    writeOutputCSV: mockWriteOutputCSV
  }))
}))

vi.mock('../../src/services/openai.service.js', () => {
  const MockedOpenAIService = vi
    .fn()
    .mockImplementation(() => ({ generateMindMap: mockGenerateMindMap }))
  return { default: MockedOpenAIService }
})

const mockStorageServiceInstance: IStorageService = {
  storeMindMap: mockStoreMindMap,
  initBucket: mockInitBucket,
  getAllMindMaps: mockGetAllMindMaps
}

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
  silent: false
} as unknown as FastifyBaseLogger

describe('StorageService', () => {
  let storageService: StorageService
  const testProjectId = 'test-project'
  const testBucketName = 'test-bucket'

  beforeEach(() => {
    vi.clearAllMocks()

    storageService = new StorageService(
      testProjectId,
      testBucketName,
      undefined,
      mockLogger
    )

    mockExistsFn.mockClear()
    mockCreateBucketFn.mockClear()
    mockSaveFn.mockClear()
    mockFileFn.mockClear()
    mockGetFilesFn.mockClear()
    mockDownloadFn.mockClear()
    mockBucketFn.mockClear()
  })

  describe('initBucket', () => {
    it('should create a bucket if it does not exist', async () => {
      vi.mocked(mockExistsFn).mockResolvedValueOnce([false])
      vi.mocked(mockCreateBucketFn).mockResolvedValueOnce([mockBucketInstance])
      await storageService.initBucket()
      expect(mockExistsFn).toHaveBeenCalledTimes(1)
      expect(mockCreateBucketFn).toHaveBeenCalledTimes(1)
      expect(mockCreateBucketFn).toHaveBeenCalledWith(testBucketName)
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Bucket ${testBucketName} created.`
      )
    })

    it('should not create a bucket if it already exists', async () => {
      vi.mocked(mockExistsFn).mockResolvedValueOnce([true])
      await storageService.initBucket()
      expect(mockExistsFn).toHaveBeenCalledTimes(1)
      expect(mockCreateBucketFn).not.toHaveBeenCalled()
    })

    it('should handle errors properly', async () => {
      const error = new Error('Init failed')
      vi.mocked(mockExistsFn).mockRejectedValueOnce(error)
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
      mockSaveFn.mockResolvedValue(undefined)

      const result = await storageService.storeMindMap(testMindMap)
      expect(result).toBe(expectedFileName)
      expect(mockFileFn).toHaveBeenCalledWith(expectedFileName)
      expect(mockSaveFn).toHaveBeenCalledTimes(1)

      expect(mockSaveFn).toHaveBeenCalledWith(
        JSON.stringify(testMindMap, null, 2),
        expect.anything()
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
      const error = new Error('Save failed')
      mockSaveFn.mockRejectedValueOnce(error)

      await expect(storageService.storeMindMap(testMindMap)).rejects.toThrow(
        StorageServiceError
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error storing mind map:',
        error
      )
      expect(mockFileFn).toHaveBeenCalledWith(expectedFileName)
      expect(mockSaveFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAllMindMaps', () => {
    const createMockGCSFileObject = (
      id: string,
      subject: string,
      topic: string
    ): MockedFile => {
      const mindMap: MindMap = {
        id: `id-${id}`,
        subject,
        topic,
        root: {
          id: `root-${id}`,
          text: `Root ${id}`,
          children: []
        },
        createdAt: '2023-01-01T00:00:00.000Z'
      }
      const specificDownloadMock = vi
        .fn()
        .mockResolvedValue([Buffer.from(JSON.stringify(mindMap))])
      const specificSaveMock = vi.fn().mockResolvedValue(undefined)

      return {
        name: `${subject}_${topic}_${id}.json`,
        download: specificDownloadMock,
        save: specificSaveMock
      }
    }

    it('should retrieve the first page of mind maps', async () => {
      const mockFile = createMockGCSFileObject('1', 'Sub1', 'Top1')
      mockGetFilesFn.mockResolvedValueOnce([
        [mockFile],
        { pageToken: 'next-page-token' },
        {}
      ])

      const result = await storageService.getAllMindMaps(undefined, 1)

      expect(result.mindMaps.length).toBe(1)
      expect(result.nextPageToken).toBe('next-page-token')
      expect(mockGetFilesFn).toHaveBeenCalledTimes(1)
      expect(mockFile.download).toHaveBeenCalledTimes(1)
    })

    it('should retrieve a subsequent page using pageToken', async () => {
      const mockFile2 = createMockGCSFileObject('2', 'Sub2', 'Top2')
      mockGetFilesFn.mockResolvedValueOnce([
        [mockFile2],
        { pageToken: 'tokenForPage3' },
        {}
      ])

      const result = await storageService.getAllMindMaps('tokenForPage2', 1)

      expect(result.mindMaps.length).toBe(1)
      expect(result.nextPageToken).toBe('tokenForPage3')
      expect(mockGetFilesFn).toHaveBeenCalledTimes(1)
      expect(mockFile2.download).toHaveBeenCalledTimes(1)
    })

    it('should handle individual download errors gracefully', async () => {
      const mockFile1 = createMockGCSFileObject('1', 'Good', 'File1')
      const mockFileCorrupt = createMockGCSFileObject('2', 'Corrupt', 'File2')
      const mockFile3 = createMockGCSFileObject('3', 'Good', 'File3')
      const downloadError = new Error('Download failed')

      vi.mocked(mockFileCorrupt.download).mockRejectedValueOnce(downloadError)
      mockGetFilesFn.mockResolvedValueOnce([
        [mockFile1, mockFileCorrupt, mockFile3],
        null,
        {}
      ])

      const result = await storageService.getAllMindMaps(undefined, 3)

      expect(result.mindMaps.length).toBe(2)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to download or parse file ${mockFileCorrupt.name}`
        ),
        downloadError
      )
    })
    it('should return empty result if no files exist', async () => {
      mockGetFilesFn.mockResolvedValueOnce([[], null, {}])

      const result = await storageService.getAllMindMaps()

      expect(result).toEqual({ mindMaps: [], nextPageToken: undefined })
      expect(mockGetFilesFn).toHaveBeenCalledTimes(1)
    })
    it('should handle listing errors properly', async () => {
      const error = new Error('Test GCS list error')
      mockGetFilesFn.mockRejectedValueOnce(error)

      await expect(storageService.getAllMindMaps()).rejects.toThrow(
        StorageServiceError
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error retrieving mind maps list from GCS'),
        error
      )
    })
  })
})

describe('MindMapService', () => {
  let mindMapService: MindMapService

  let mockedCsvServiceInstance: CSVService
  let mockedOpenAIServiceInstance: OpenAIService

  beforeEach(() => {
    vi.clearAllMocks()

    mockedCsvServiceInstance = new (vi.mocked(CSVService, true))()
    mockedOpenAIServiceInstance = new (vi.mocked(OpenAIService, true))(
      'dummy-key',
      mockLogger
    )

    mindMapService = new MindMapService(
      mockedCsvServiceInstance,
      mockedOpenAIServiceInstance,
      mockStorageServiceInstance,
      mockLogger,
      { retries: 0 }
    )
  })

  afterEach(() => {})

  describe('processMindMaps', () => {
    const baseOutputName = 'output_results.csv'

    it('should write partial and final CSV files correctly when batching occurs', async () => {
      const inputCsvPath = 'input.csv'
      const outputCsvPath = 'output.csv'
      const batchSize = 1
      const inputRows: CSVInputRow[] = [
        { subject: 'Sub1', topic: 'Top1' },
        { subject: 'Sub2', topic: 'Top2' }
      ]
      const generatedMindMap1: MindMap = {
        id: '1',
        subject: 'Sub1',
        topic: 'Top1',
        root: { id: 'r1', text: 'T1' },
        createdAt: '...'
      }
      const generatedMindMap2: MindMap = {
        id: '2',
        subject: 'Sub2',
        topic: 'Top2',
        root: { id: 'r2', text: 'T2' },
        createdAt: '...'
      }

      mockReadInputCSV.mockResolvedValue(inputRows)
      vi.mocked(mockedOpenAIServiceInstance.generateMindMap)
        .mockResolvedValueOnce(generatedMindMap1)
        .mockResolvedValueOnce(generatedMindMap2)
      mockStoreMindMap.mockResolvedValue('file.json')
      mockWriteOutputCSV.mockResolvedValue(undefined)

      const partialFilePath1 = `/tmp/${baseOutputName}.partial.${1 * batchSize}`
      const partialFilePath2 = `/tmp/${baseOutputName}.partial.${2 * batchSize}`
      const finalFilePath = outputCsvPath

      await mindMapService.processMindMaps(
        inputCsvPath,
        outputCsvPath,
        5,
        batchSize
      )

      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        partialFilePath1,

        expect.arrayContaining([
          expect.objectContaining({ topic: 'Top1', status: 'Success' })
        ])
      )
      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        partialFilePath2,

        expect.arrayContaining([
          expect.objectContaining({ topic: 'Top1', status: 'Success' }),
          expect.objectContaining({ topic: 'Top2', status: 'Success' })
        ])
      )
      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        finalFilePath,

        expect.arrayContaining([
          expect.objectContaining({ topic: 'Top1', status: 'Success' }),
          expect.objectContaining({ topic: 'Top2', status: 'Success' })
        ])
      )

      expect(mockWriteOutputCSV).toHaveBeenCalledTimes(3)
    })

    it('should write partial and final CSV even if processing fails for some rows', async () => {
      const inputCsvPath = 'input.csv'
      const outputCsvPath = 'output.csv'
      const batchSize = 1
      const inputRows: CSVInputRow[] = [{ subject: 'Sub1', topic: 'Top1' }]
      const processingError = new Error('Failed during generation')

      mockReadInputCSV.mockResolvedValue(inputRows)
      vi.mocked(
        mockedOpenAIServiceInstance.generateMindMap
      ).mockRejectedValueOnce(processingError)
      mockWriteOutputCSV.mockResolvedValue(undefined)

      const partialFilePath1 = `/tmp/${baseOutputName}.partial.${1 * batchSize}`
      const finalFilePath = outputCsvPath

      const results = await mindMapService.processMindMaps(
        inputCsvPath,
        outputCsvPath,
        5,
        batchSize
      )

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: 'Top1',
            status: 'Failure',
            error: processingError.message
          })
        ])
      )

      const expectedFailureResult = expect.arrayContaining([
        expect.objectContaining({
          topic: 'Top1',
          status: 'Failure',
          error: processingError.message
        })
      ])

      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        partialFilePath1,
        expectedFailureResult
      )
      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        finalFilePath,
        expectedFailureResult
      )

      expect(mockWriteOutputCSV).toHaveBeenCalledTimes(2)
    })

    it('should write only one partial and the final file when only one batch is processed', async () => {
      const inputCsvPath = 'input.csv'
      const outputCsvPath = 'output.csv'
      const batchSize = 5
      const inputRows: CSVInputRow[] = [
        { subject: 'Sub1', topic: 'Top1' },
        { subject: 'Sub2', topic: 'Top2' }
      ]
      const generatedMindMap1: MindMap = {
        id: '1',
        subject: 'Sub1',
        topic: 'Top1',
        root: { id: 'r1', text: 'T1' },
        createdAt: '...'
      }
      const generatedMindMap2: MindMap = {
        id: '2',
        subject: 'Sub2',
        topic: 'Top2',
        root: { id: 'r2', text: 'T2' },
        createdAt: '...'
      }

      mockReadInputCSV.mockResolvedValue(inputRows)
      vi.mocked(mockedOpenAIServiceInstance.generateMindMap)
        .mockResolvedValueOnce(generatedMindMap1)
        .mockResolvedValueOnce(generatedMindMap2)
      mockStoreMindMap.mockResolvedValue('file.json')
      mockWriteOutputCSV.mockResolvedValue(undefined)

      const processedRowCount = inputRows.length
      const partialFilePathExpected = `/tmp/${baseOutputName}.partial.${processedRowCount}`
      const finalFilePath = outputCsvPath

      await mindMapService.processMindMaps(
        inputCsvPath,
        outputCsvPath,
        5,
        batchSize
      )

      const expectedSuccessResults = expect.arrayContaining([
        expect.objectContaining({ topic: 'Top1', status: 'Success' }),
        expect.objectContaining({ topic: 'Top2', status: 'Success' })
      ])

      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        partialFilePathExpected,
        expectedSuccessResults
      )
      expect(mockWriteOutputCSV).toHaveBeenCalledWith(
        finalFilePath,
        expectedSuccessResults
      )

      expect(mockWriteOutputCSV).toHaveBeenCalledTimes(2)
    })
  })
})
