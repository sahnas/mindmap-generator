import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs, { Dirent } from 'fs'
import path from 'path'
import { LocalStorageService } from '../../src/services/local-storage.service.js'
import { MindMap, MindMapNode } from '../../src/types/index.js'
import { FastifyBaseLogger } from 'fastify'

vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn(),
      promises: {
        writeFile: vi.fn(),
        readFile: vi.fn()
      }
    }
  }
})

vi.mock('path', () => ({
  default: {
    join: vi.fn((dir, file) => `${dir}/${file}`),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
  }
}))

describe('LocalStorageService', () => {
  let storageService: LocalStorageService
  let mockLogger: Partial<FastifyBaseLogger>
  const testStoragePath = '/test/storage'

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    storageService = new LocalStorageService(
      testStoragePath,
      mockLogger as FastifyBaseLogger
    )

    vi.mocked(fs.existsSync).mockReset()
    vi.mocked(fs.mkdirSync).mockReset()
    vi.mocked(fs.readdirSync).mockReset()
    vi.mocked(fs.promises.writeFile).mockReset().mockResolvedValue(undefined)
    vi.mocked(fs.promises.readFile).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initBucket', () => {
    it('should create storage directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

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

      expect(fs.existsSync).toHaveBeenCalledWith(testStoragePath)
      expect(fs.mkdirSync).toHaveBeenCalledWith(testStoragePath, {
        recursive: true
      })
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
        subject: 'Mathematik',
        topic: 'Algebra',
        root: {
          id: 'root-id',
          text: 'Algebra',
          children: [
            {
              id: 'child-1',
              text: 'Equations'
            }
          ]
        },
        createdAt: '2025-04-10T12:00:00Z'
      }

      const expectedFileName = 'Mathematik_Algebra_test-uuid.json'
      const expectedFilePath = `${testStoragePath}/${expectedFileName}`

      const result = await storageService.storeMindMap(sampleMindMap)

      expect(path.join).toHaveBeenCalledWith(testStoragePath, expectedFileName)
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
        root: {
          id: 'root-id',
          text: 'Data Structures',
          children: []
        },
        createdAt: '2025-04-10T12:00:00Z'
      }

      const expectedFileName = 'Computer_Science_Data_Structures_test-uuid.json'
      const expectedFilePath = `${testStoragePath}/${expectedFileName}`

      const result = await storageService.storeMindMap(sampleMindMap)

      expect(path.join).toHaveBeenCalledWith(testStoragePath, expectedFileName)
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(sampleMindMap, null, 2)
      )
      expect(result).toBe(expectedFileName)
    })

    it('should handle file write errors', async () => {
      const sampleMindMap: MindMap = {
        id: 'test-uuid',
        subject: 'Mathematik',
        topic: 'Algebra',
        root: {
          id: 'root-id',
          text: 'Algebra',
          children: []
        },
        createdAt: '2025-04-10T12:00:00Z'
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

      expect(fs.existsSync).toHaveBeenCalledWith(testStoragePath)
      expect(result).toEqual({ mindMaps: [], total: 0, hasMore: false })
    })

    it('should return mind maps from storage directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const mockFileNames = [
        'Mathematik_Algebra_id1.json',
        'Biologie_Zellen_id2.json',
        'not-a-json-file.txt'
      ]
      vi.mocked(fs.readdirSync).mockReturnValue(
        mockFileNames as unknown as Dirent[]
      )

      const mockMindMaps: MindMap[] = [
        {
          id: 'id1',
          subject: 'Mathematik',
          topic: 'Algebra',
          root: { id: 'root1', text: 'Algebra', children: [] } as MindMapNode,
          createdAt: '2025-04-10T12:00:00Z'
        },
        {
          id: 'id2',
          subject: 'Biologie',
          topic: 'Zellen',
          root: { id: 'root2', text: 'Zellen', children: [] } as MindMapNode,
          createdAt: '2025-04-10T13:00:00Z'
        }
      ]

      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(mockMindMaps[0]))
        .mockResolvedValueOnce(JSON.stringify(mockMindMaps[1]))

      const offset = 0
      const limit = 10
      const result = await storageService.getAllMindMaps(offset, limit)

      expect(fs.existsSync).toHaveBeenCalledWith(testStoragePath)
      expect(fs.readdirSync).toHaveBeenCalledWith(testStoragePath)

      expect(fs.promises.readFile).toHaveBeenCalledTimes(2)
      expect(path.join).toHaveBeenCalledWith(testStoragePath, mockFileNames[0])
      expect(path.join).toHaveBeenCalledWith(testStoragePath, mockFileNames[1])

      expect(result).toEqual({
        mindMaps: mockMindMaps,
        total: 2,
        hasMore: false
      })
    })

    it('should handle pagination correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const mockFileNames = Array.from(
        { length: 10 },
        (_, i) => `file_${i + 1}.json`
      )
      vi.mocked(fs.readdirSync).mockReturnValue(
        mockFileNames as unknown as Dirent[]
      )

      vi.mocked(fs.promises.readFile).mockImplementation((path) => {
        const fileIndex = Number(String(path).split('_')[1].split('.')[0])
        const mockMindMap: MindMap = {
          id: `id${fileIndex}`,
          subject: 'Subject',
          topic: `Topic ${fileIndex}`,
          root: {
            id: `root${fileIndex}`,
            text: `Topic ${fileIndex}`,
            children: []
          } as MindMapNode,
          createdAt: new Date().toISOString()
        }
        return Promise.resolve(JSON.stringify(mockMindMap))
      })

      const offset = 3
      const limit = 4
      const result = await storageService.getAllMindMaps(offset, limit)

      expect(fs.promises.readFile).toHaveBeenCalledTimes(4)

      expect(result.total).toBe(10)
      expect(result.hasMore).toBe(true)
      expect(result.mindMaps.length).toBe(4)

      for (let i = 0; i < 4; i++) {
        const expectedFileIndex = i + offset + 1
        expect(result.mindMaps[i].id).toBe(`id${expectedFileIndex}`)
      }
    })

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const mockFileNames = ['valid.json', 'corrupt.json']
      vi.mocked(fs.readdirSync).mockReturnValue(
        mockFileNames as unknown as Dirent[]
      )

      const validMindMap: MindMap = {
        id: 'valid-id',
        subject: 'Valid Subject',
        topic: 'Valid Topic',
        root: {
          id: 'root-id',
          text: 'Valid Topic',
          children: []
        } as MindMapNode,
        createdAt: new Date().toISOString()
      }

      vi.mocked(fs.promises.readFile)
        .mockResolvedValueOnce(JSON.stringify(validMindMap))
        .mockRejectedValueOnce(new Error('File read error'))

      const result = await storageService.getAllMindMaps()

      expect(fs.promises.readFile).toHaveBeenCalledTimes(2)

      expect(result.mindMaps.length).toBe(1)
      expect(result.mindMaps[0]).toEqual(validMindMap)
      expect(result.total).toBe(2)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error reading mind map file corrupt.json:'),
        expect.any(Error)
      )
    })

    it('should handle directory read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const mockError = new Error('Directory read error')
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw mockError
      })

      await expect(storageService.getAllMindMaps()).rejects.toThrow(mockError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error retrieving mind maps:',
        mockError
      )
    })

    // Ajout dans local-storage.service.test.ts
    it('should handle pagination edge cases correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      // Créer un ensemble de fichiers de test
      const totalFiles = 20
      const mockFileNames = Array(totalFiles)
        .fill(0)
        .map((_, i) => `file_${i}.json`)
      vi.mocked(fs.readdirSync).mockReturnValue(
        mockFileNames as unknown as Dirent[]
      )

      // Configurer le mock de lecture de fichier
      vi.mocked(fs.promises.readFile).mockImplementation((path) => {
        const index = parseInt(String(path).match(/file_(\d+)/)?.[1] || '0')
        return Promise.resolve(
          JSON.stringify({
            id: `id-${index}`,
            subject: 'Subject',
            topic: `Topic ${index}`,
            root: { id: `root-${index}`, text: `Topic ${index}` },
            createdAt: new Date().toISOString()
          })
        )
      })

      // Tester les cas limites

      // 1. Offset = 0, limit = 0 (devrait retourner un tableau vide)
      let result = await storageService.getAllMindMaps(0, 0)
      expect(result.mindMaps).toHaveLength(0)
      expect(result.total).toBe(totalFiles)
      expect(result.hasMore).toBe(true)

      // 2. Offset > total (devrait retourner un tableau vide)
      result = await storageService.getAllMindMaps(totalFiles + 10, 10)
      expect(result.mindMaps).toHaveLength(0)
      expect(result.total).toBe(totalFiles)
      expect(result.hasMore).toBe(false)

      // 3. Offset + limit = total exactement (hasMore devrait être false)
      result = await storageService.getAllMindMaps(10, 10)
      expect(result.mindMaps).toHaveLength(10)
      expect(result.total).toBe(totalFiles)
      expect(result.hasMore).toBe(false)

      // 4. Limit > total (devrait retourner toutes les mind maps)
      result = await storageService.getAllMindMaps(0, totalFiles + 10)
      expect(result.mindMaps).toHaveLength(totalFiles)
      expect(result.total).toBe(totalFiles)
      expect(result.hasMore).toBe(false)
    })
  })
})
