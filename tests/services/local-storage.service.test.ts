import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  let actualFs: typeof import('fs') | undefined
  try {
    actualFs = await importOriginal<typeof import('fs')>()
  } catch (err) {
    console.warn(
      "Could not import original 'fs' for rmSync mock fallback.",
      err
    )
  }

  const writeFileMock = vi.fn()
  const readFileMock = vi.fn()
  const readdirMock = vi.fn()
  const existsSyncMock = vi.fn()
  const mkdirSyncMock = vi.fn()
  const readdirSyncMock = vi.fn()
  const rmSyncMock = actualFs?.rmSync ?? vi.fn()

  return {
    default: {
      existsSync: existsSyncMock,
      mkdirSync: mkdirSyncMock,
      readdirSync: readdirSyncMock,
      rmSync: rmSyncMock,
      promises: {
        writeFile: writeFileMock,
        readFile: readFileMock,
        readdir: readdirMock
      }
    }
  }
})

import fs, { Dirent } from 'fs'
import path from 'path'
import { LocalStorageService } from '../../src/services/local-storage.service.js'
import { MindMap, MindMapNode } from '../../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'

describe('LocalStorageService', () => {
  let storageService: LocalStorageService
  let mockLogger: Partial<FastifyBaseLogger>
  const testStoragePath = '/test/storage'

  beforeEach(() => {
    vi.resetAllMocks()

    mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
    storageService = new LocalStorageService(
      testStoragePath,
      mockLogger as FastifyBaseLogger
    )

    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined)
    vi.mocked(fs.promises.readFile).mockResolvedValue('{}')

    vi.mocked(fs.promises.readdir).mockResolvedValue([] as unknown as Dirent[])
  })

  describe('initBucket', () => {
    it('should create storage directory if it does not exist', async () => {
      await storageService.initBucket()
      expect(fs.existsSync).toHaveBeenCalledWith(testStoragePath)
      expect(fs.mkdirSync).toHaveBeenCalledWith(testStoragePath, {
        recursive: true
      })
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Storage directory ${testStoragePath} created.`
      )
    })

    it('should not create storage directory if it already exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      await storageService.initBucket()
      expect(fs.existsSync).toHaveBeenCalledWith(testStoragePath)
      expect(fs.mkdirSync).not.toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Storage directory ${testStoragePath} already exists.`
      )
    })

    it('should handle errors when creating storage directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const mockError = new Error('Directory creation error')
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw mockError
      })
      await expect(storageService.initBucket()).rejects.toThrow(mockError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing storage directory:',
        mockError
      )
    })
  })

  describe('storeMindMap', () => {
    it('should store mind map correctly', async () => {
      const sampleMindMap: MindMap = {
        id: 'test-uuid',
        subject: 'Sub',
        topic: 'Top',
        root: {} as MindMapNode,
        createdAt: '...'
      }
      const expectedFileName = 'Sub_Top_test-uuid.json'
      const expectedFilePath = path.join(testStoragePath, expectedFileName)

      const result = await storageService.storeMindMap(sampleMindMap)

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(sampleMindMap, null, 2)
      )
      expect(result).toBe(expectedFileName)
    })

    it('should handle spaces in subject and topic names', async () => {
      const sampleMindMap: MindMap = {
        id: 'test-uuid',
        subject: 'Computer Science',
        topic: 'Data Structures',
        root: {} as MindMapNode,
        createdAt: '...'
      }
      const expectedFileName = 'Computer_Science_Data_Structures_test-uuid.json'
      const expectedFilePath = path.join(testStoragePath, expectedFileName)
      await storageService.storeMindMap(sampleMindMap)
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(sampleMindMap, null, 2)
      )
    })

    it('should handle file write errors', async () => {
      const sampleMindMap: MindMap = {
        id: 'test-uuid',
        subject: 'Sub',
        topic: 'Top',
        root: {} as MindMapNode,
        createdAt: '...'
      }
      const mockError = new Error('File write error')
      vi.mocked(fs.promises.writeFile).mockRejectedValue(mockError)
      await expect(storageService.storeMindMap(sampleMindMap)).rejects.toThrow(
        mockError
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error storing mind map:',
        mockError
      )
    })
  })

  describe('getAllMindMaps', () => {
    it('should return empty array if storage directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const result = await storageService.getAllMindMaps()
      expect(result).toEqual({
        mindMaps: [],
        total: 0,
        nextPageToken: undefined
      })
      expect(fs.promises.readdir).not.toHaveBeenCalled()
    })

    it('should return mind maps from storage directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const mockFileNames = [
        'Math_Alg_id1.json',
        'Bio_Cell_id2.json',
        'ignore.txt'
      ]

      vi.mocked(fs.promises.readdir).mockResolvedValue(
        mockFileNames as unknown as Dirent[]
      )

      const mockData = [
        { id: 'id1', subject: 'Math' },
        { id: 'id2', subject: 'Bio' }
      ]
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        const fName = path.basename(p as string)
        if (fName === mockFileNames[0]) return JSON.stringify(mockData[0])
        if (fName === mockFileNames[1]) return JSON.stringify(mockData[1])
        throw new Error('Unexpected file read')
      })

      const result = await storageService.getAllMindMaps(undefined, 10)

      expect(result.mindMaps).toHaveLength(2)
      expect(result.mindMaps[0].id).toBe('id1')
      expect(result.mindMaps[1].id).toBe('id2')
      expect(result.total).toBe(2)
      expect(result.nextPageToken).toBeUndefined()
      expect(fs.promises.readFile).toHaveBeenCalledTimes(2)
    })

    it('should handle pagination correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const totalFiles = 10
      const mockFileNames = Array.from(
        { length: totalFiles },
        (_, i) => `file_${i + 1}.json`
      )

      vi.mocked(fs.promises.readdir).mockResolvedValue(
        mockFileNames as unknown as Dirent[]
      )

      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        const fileIndexMatch = path
          .basename(p as string)
          .match(/file_(\d+)\.json/)
        const fileIndex = parseInt(fileIndexMatch![1], 10)
        return JSON.stringify({ id: `id${fileIndex}` })
      })

      const offset = 3
      const limit = 4
      const result = await storageService.getAllMindMaps(String(offset), limit)

      expect(result.mindMaps).toHaveLength(4)
      expect(result.total).toBe(10)
      expect(result.mindMaps[0].id).toBe('id4')
      expect(result.mindMaps[3].id).toBe('id7')
      expect(result.nextPageToken).toBe(String(offset + limit))
    })

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const mockFileNames = ['valid.json', 'corrupt.json']

      vi.mocked(fs.promises.readdir).mockResolvedValue(
        mockFileNames as unknown as Dirent[]
      )
      const validData = { id: 'valid-id' }
      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (path.basename(p as string) === 'valid.json')
          return JSON.stringify(validData)
        throw new Error('File read error')
      })

      const result = await storageService.getAllMindMaps()

      expect(result.mindMaps).toHaveLength(1)
      expect(result.mindMaps[0]).toMatchObject(validData)
      expect(result.total).toBe(2)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error reading or parsing local mind map file corrupt.json:'
        ),
        expect.any(Error)
      )
      expect(result.nextPageToken).toBeUndefined()
    })

    it('should handle directory read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const mockError = new Error('Directory read error')
      vi.mocked(fs.promises.readdir).mockRejectedValue(mockError)

      await expect(storageService.getAllMindMaps()).rejects.toThrow(mockError)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error retrieving mind maps from local storage:',
        mockError
      )
    })

    it('should handle pagination edge cases correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const totalFiles = 20
      const mockFileNames = Array(totalFiles)
        .fill(0)
        .map((_, i) => `file_${i}.json`)

      vi.mocked(fs.promises.readdir).mockResolvedValue(
        mockFileNames as unknown as Dirent[]
      )

      vi.mocked(fs.promises.readFile).mockImplementation(async (filePath) => {
        const index = parseInt(
          path.basename(filePath as string).match(/file_(\d+)\.json/)?.[1] ||
            '0'
        )
        return JSON.stringify({ id: `id-${index}` })
      })

      let result = await storageService.getAllMindMaps(undefined, 0)
      expect(result.mindMaps).toHaveLength(0)
      expect(result.total).toBe(totalFiles)
      expect(result.nextPageToken).toBe('0')

      result = await storageService.getAllMindMaps(String(totalFiles), 10)
      expect(result.mindMaps).toHaveLength(0)
      expect(result.total).toBe(totalFiles)
      expect(result.nextPageToken).toBeUndefined()

      result = await storageService.getAllMindMaps('10', 10)
      expect(result.mindMaps).toHaveLength(10)
      expect(result.total).toBe(totalFiles)
      expect(result.nextPageToken).toBeUndefined()

      result = await storageService.getAllMindMaps(undefined, totalFiles + 10)
      expect(result.mindMaps).toHaveLength(totalFiles)
      expect(result.total).toBe(totalFiles)
      expect(result.nextPageToken).toBeUndefined()
    })
  })
})
