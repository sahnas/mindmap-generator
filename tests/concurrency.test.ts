import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { LocalStorageService } from '../src/services/local-storage.service.js'
import { MindMap } from '../src/types/index.js'
import TestFixtures from './fixtures.js'

describe('Storage Concurrency Handling', () => {
  const TEST_DIR = path.join(process.cwd(), 'concurrency-test-data')
  const STORAGE_PATH = path.join(TEST_DIR, 'mindmaps')

  let storageService: LocalStorageService

  beforeEach(async () => {
    vi.clearAllMocks()

    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!fs.existsSync(STORAGE_PATH)) {
      fs.mkdirSync(STORAGE_PATH, { recursive: true })
    }

    storageService = new LocalStorageService(STORAGE_PATH)
    await storageService.initBucket()
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should handle concurrent file writes without corruption', async () => {
    const mindMaps: MindMap[] = Array.from({ length: 50 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `concurrent-id-${i}`,
      createdAt: new Date().toISOString()
    }))

    const fileNamePromises = mindMaps.map((mindMap) =>
      storageService.storeMindMap(mindMap)
    )
    const fileNames = await Promise.all(fileNamePromises)

    expect(fileNames.length).toBe(50)

    const files = fs.readdirSync(STORAGE_PATH)
    expect(files.length).toBe(50)

    for (let i = 0; i < fileNames.length; i++) {
      const filePath = path.join(STORAGE_PATH, fileNames[i])
      expect(fs.existsSync(filePath)).toBe(true)

      const fileContent = fs.readFileSync(filePath, 'utf8')
      const storedMindMap = JSON.parse(fileContent) as MindMap

      expect(storedMindMap.id).toBe(mindMaps[i].id)
    }
  })

  it('should handle concurrent reads and writes without interference', async () => {
    const initialMindMaps: MindMap[] = Array.from({ length: 10 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `initial-id-${i}`,
      topic: `Initial Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    await Promise.all(
      initialMindMaps.map((m) => storageService.storeMindMap(m))
    )

    const operations = []

    for (let i = 0; i < 20; i++) {
      const offset = 5 + (i % 6)
      const pageToken = offset > 0 ? String(offset) : undefined
      operations.push(storageService.getAllMindMaps(pageToken, 5))
    }

    for (let i = 0; i < 15; i++) {
      const newMindMap: MindMap = {
        ...TestFixtures.basicMindMap(),
        id: `concurrent-id-${i}`,
        topic: `Concurrent Topic ${i}`,
        createdAt: new Date().toISOString()
      }
      operations.push(storageService.storeMindMap(newMindMap))
    }

    await Promise.all(operations)

    const { mindMaps, total } = await storageService.getAllMindMaps('0', 100)

    expect(total).toBe(25)
    expect(mindMaps.length).toBe(25)

    const initialTopics = initialMindMaps.map((m) => m.topic)
    const concurrentTopics = Array.from(
      { length: 15 },
      (_, i) => `Concurrent Topic ${i}`
    )
    const allExpectedTopics = [...initialTopics, ...concurrentTopics]

    const actualTopics = mindMaps.map((m) => m.topic)

    for (const topic of allExpectedTopics) {
      expect(actualTopics).toContain(topic)
    }
  })

  it('should handle partial failures in batch operations', async () => {
    const validMindMaps: MindMap[] = Array.from({ length: 5 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `valid-id-${i}`,
      topic: `Valid Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    const invalidMindMaps: MindMap[] = Array.from({ length: 5 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `invalid-id-${i}`,
      topic: `Invalid Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    const allMindMaps = [...validMindMaps, ...invalidMindMaps].sort(
      () => Math.random() - 0.5
    )

    const originalStoreMindMap = storageService.storeMindMap
    storageService.storeMindMap = vi.fn((mindMap: MindMap) => {
      if (mindMap.id.startsWith('valid-id-')) {
        return originalStoreMindMap.call(storageService, mindMap)
      } else {
        return Promise.reject(new Error('Simulated storage failure'))
      }
    })

    try {
      const promiseResults = await Promise.all(
        allMindMaps.map((mindMap) =>
          storageService
            .storeMindMap(mindMap)
            .then((fileName) => ({ success: true, fileName }))
            .catch(() => ({ success: false }))
        )
      )

      const successCount = promiseResults.filter((r) => r.success).length
      const errorCount = promiseResults.filter((r) => !r.success).length

      expect(successCount).toBe(5)
      expect(errorCount).toBe(5)

      const { mindMaps } = await storageService.getAllMindMaps()
      expect(mindMaps.length).toBe(5)

      const storedTopics = mindMaps.map((m) => m.topic)
      validMindMaps.forEach((m: MindMap) => {
        expect(storedTopics).toContain(m.topic)
      })
    } finally {
      storageService.storeMindMap = originalStoreMindMap
    }
  })

  it('should maintain data integrity during concurrent operations', async () => {
    const testMindMaps = Array(50)
      .fill(0)
      .map((_, i) => ({
        ...TestFixtures.basicMindMap(),
        id: `concurrent-id-${i}`,
        topic: `Concurrent Topic ${i}`,
        createdAt: new Date().toISOString()
      }))

    const operations = []

    operations.push(...testMindMaps.map((m) => storageService.storeMindMap(m)))

    for (let i = 0; i < 20; i++) {
      const pageToken = i % 10 > 0 ? String(i % 10) : undefined
      operations.push(storageService.getAllMindMaps(pageToken, 5))
    }

    await Promise.all(operations)

    const allMindMaps = await storageService.getAllMindMaps(undefined, 100)

    expect(allMindMaps.total).toBe(50)

    for (let i = 0; i < 50; i++) {
      const topic = `Concurrent Topic ${i}`
      const storedMap = allMindMaps.mindMaps.find((m) => m.topic === topic)
      expect(storedMap).toBeDefined()
      expect(storedMap?.id).toBe(`concurrent-id-${i}`)
    }
  })
})
