import { describe, it, expect, vi, beforeEach, MockInstance } from 'vitest'
import { MindMapService } from '../src/services/mind-map.service.js'
import { MindMap, IStorageService } from '../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'
import TestFixtures from './fixtures.js'
import { CSVService } from '../src/services/csv.service.js'
import OpenAIService from '../src/services/openai.service.js'
import fs from 'fs'

describe('Retry Mechanism Integration Pragmatic', () => {
  let csvServiceMock: CSVService
  let openaiServiceInstance: OpenAIService
  let storageServiceMock: IStorageService
  let mindMapService: MindMapService
  let mockLogger: FastifyBaseLogger

  let generateMindMapSpy: MockInstance<
    (subject: string, topic: string) => Promise<MindMap>
  >

  const mockReadInputCSV = vi.fn()
  const mockWriteOutputCSV = vi.fn()
  const mockInitBucket = vi.fn()
  const mockStoreMindMap = vi.fn()
  const mockGetAllMindMaps = vi.fn()
  const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)

  beforeEach(async () => {
    vi.clearAllMocks()
    unlinkSpy.mockClear()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn().mockReturnThis(),
      level: 'info',
      silent: vi.fn()
    } as FastifyBaseLogger
    csvServiceMock = {
      readInputCSV: mockReadInputCSV,
      writeOutputCSV: mockWriteOutputCSV
    } as unknown as CSVService
    storageServiceMock = {
      initBucket: mockInitBucket,
      storeMindMap: mockStoreMindMap,
      getAllMindMaps: mockGetAllMindMaps
    } as IStorageService

    openaiServiceInstance = new OpenAIService('dummy-key', mockLogger)
    if (typeof openaiServiceInstance.generateMindMap !== 'function') {
      openaiServiceInstance.generateMindMap = vi.fn()
    }
    generateMindMapSpy = vi.spyOn(openaiServiceInstance, 'generateMindMap')

    mockReadInputCSV
      .mockReset()
      .mockResolvedValue([{ subject: 'Mathematics', topic: 'Algebra' }])
    mockWriteOutputCSV.mockReset().mockResolvedValue(undefined)
    mockInitBucket.mockReset().mockResolvedValue(undefined)
    mockStoreMindMap.mockReset().mockResolvedValue('filename.json')
    mockGetAllMindMaps
      .mockReset()
      .mockResolvedValue({ mindMaps: [], nextPageToken: undefined })
    if (
      generateMindMapSpy &&
      typeof generateMindMapSpy.mockClear === 'function'
    ) {
      generateMindMapSpy.mockClear()
    }
  })

  it('should return Failure if all attempts fail', async () => {
    const retryOptions = { retries: 1 }
    const failureError = new Error('Service unavailable')
    generateMindMapSpy.mockRejectedValue(failureError)

    mindMapService = new MindMapService(
      csvServiceMock,
      openaiServiceInstance,
      storageServiceMock,
      mockLogger,
      retryOptions
    )
    const results = await mindMapService.processMindMaps(
      'input.csv',
      'output.csv'
    )

    expect(results[0].status).toBe('Failure')
    expect(results[0].error).toBe(failureError.message)

    expect(generateMindMapSpy).toHaveBeenCalledTimes(2)
  })

  it('should return Success if an attempt succeeds after failures', async () => {
    const retryOptions = { retries: 1 }
    const mockMindMap: MindMap = TestFixtures.basicMindMap()
    const temporaryError = new Error('Temporary error')

    generateMindMapSpy
      .mockRejectedValueOnce(temporaryError)
      .mockResolvedValueOnce(mockMindMap)

    mindMapService = new MindMapService(
      csvServiceMock,
      openaiServiceInstance,
      storageServiceMock,
      mockLogger,
      retryOptions
    )
    const results = await mindMapService.processMindMaps(
      'input.csv',
      'output.csv'
    )

    expect(results).toEqual([{ topic: 'Algebra', status: 'Success' }])

    expect(generateMindMapSpy).toHaveBeenCalledTimes(2)

    expect(storageServiceMock.storeMindMap).toHaveBeenCalledWith(mockMindMap)
  })

  it('should use default retry options if none provided and fail (outcome only)', async () => {
    const failureError = new Error('Always fails default')
    generateMindMapSpy.mockRejectedValue(failureError)

    mindMapService = new MindMapService(
      csvServiceMock,
      openaiServiceInstance,
      storageServiceMock,
      mockLogger
    )
    const results = await mindMapService.processMindMaps(
      'input.csv',
      'output.csv'
    )

    expect(results[0].status).toBe('Failure')
    expect(results[0].error).toBe(failureError.message)

    expect(generateMindMapSpy).toHaveBeenCalledTimes(4)
  }, 15000)
})
