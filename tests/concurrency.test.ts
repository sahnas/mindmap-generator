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

    // Setup test directory
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
    // Clean up test data
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should handle concurrent file writes without corruption', async () => {
    // Create 50 mind maps with the same subject/topic but different IDs
    const mindMaps: MindMap[] = Array.from({ length: 50 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `concurrent-id-${i}`,
      createdAt: new Date().toISOString()
    }))

    // Store them all concurrently
    const fileNamePromises = mindMaps.map((mindMap) =>
      storageService.storeMindMap(mindMap)
    )
    const fileNames = await Promise.all(fileNamePromises)

    // Verify all files were created
    expect(fileNames.length).toBe(50)

    // Check for all files in the storage directory
    const files = fs.readdirSync(STORAGE_PATH)
    expect(files.length).toBe(50)

    // Verify each file contains the correct mind map
    for (let i = 0; i < fileNames.length; i++) {
      const filePath = path.join(STORAGE_PATH, fileNames[i])
      expect(fs.existsSync(filePath)).toBe(true)

      const fileContent = fs.readFileSync(filePath, 'utf8')
      const storedMindMap = JSON.parse(fileContent) as MindMap

      expect(storedMindMap.id).toBe(mindMaps[i].id)
    }
  })

  it('should handle concurrent reads and writes without interference', async () => {
    // First, create some initial mind maps
    const initialMindMaps: MindMap[] = Array.from({ length: 10 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `initial-id-${i}`,
      topic: `Initial Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    // Store initial mind maps
    await Promise.all(
      initialMindMaps.map((m) => storageService.storeMindMap(m))
    )

    // Perform concurrent reads and writes
    const operations = []

    // Add read operations
    for (let i = 0; i < 20; i++) {
      operations.push(storageService.getAllMindMaps(0, 5 + (i % 6))) // Different page sizes
    }

    // Add write operations
    for (let i = 0; i < 15; i++) {
      const newMindMap: MindMap = {
        ...TestFixtures.basicMindMap(),
        id: `concurrent-id-${i}`,
        topic: `Concurrent Topic ${i}`,
        createdAt: new Date().toISOString()
      }
      operations.push(storageService.storeMindMap(newMindMap))
    }

    // Execute all operations concurrently
    await Promise.all(operations)

    // Verify final state
    const { mindMaps, total } = await storageService.getAllMindMaps(0, 100)

    // We should have 10 initial + 15 new = 25 mind maps
    expect(total).toBe(25)
    expect(mindMaps.length).toBe(25)

    // Verify the mind maps exist and are not corrupted
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
    // Create a mix of valid and invalid mind maps
    const validMindMaps: MindMap[] = Array.from({ length: 5 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `valid-id-${i}`,
      topic: `Valid Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    // Create invalid mind maps that will be rejected
    const invalidMindMaps: MindMap[] = Array.from({ length: 5 }, (_, i) => ({
      ...TestFixtures.basicMindMap(),
      id: `invalid-id-${i}`,
      topic: `Invalid Topic ${i}`,
      createdAt: new Date().toISOString()
    }))

    // Mix valid and invalid maps together
    const allMindMaps = [...validMindMaps, ...invalidMindMaps].sort(
      () => Math.random() - 0.5
    )

    // Mock the storeMindMap method to selectively fail
    const originalStoreMindMap = storageService.storeMindMap
    storageService.storeMindMap = vi.fn((mindMap: MindMap) => {
      // Only allow valid mind maps to succeed
      if (mindMap.id.startsWith('valid-id-')) {
        return originalStoreMindMap.call(storageService, mindMap)
      } else {
        return Promise.reject(new Error('Simulated storage failure'))
      }
    })

    try {
      // Try to store them all concurrently and collect results
      const promiseResults = await Promise.all(
        allMindMaps.map((mindMap) =>
          storageService
            .storeMindMap(mindMap)
            .then((fileName) => ({ success: true, fileName }))
            .catch(() => ({ success: false }))
        )
      )

      // Count successful operations vs errors
      const successCount = promiseResults.filter((r) => r.success).length
      const errorCount = promiseResults.filter((r) => !r.success).length

      expect(successCount).toBe(5) // Only valid mind maps should succeed
      expect(errorCount).toBe(5) // Invalid mind maps should fail

      // Verify the storage state
      const { mindMaps } = await storageService.getAllMindMaps()
      expect(mindMaps.length).toBe(5)

      // Only valid mind maps should be stored
      const storedTopics = mindMaps.map((m) => m.topic)
      validMindMaps.forEach((m: MindMap) => {
        expect(storedTopics).toContain(m.topic)
      })
    } finally {
      // Restore the original storeMindMap method
      storageService.storeMindMap = originalStoreMindMap
    }
  })

  // Amélioration dans concurrency.test.ts
  it('should maintain data integrity during concurrent operations', async () => {
    // Créer un jeu de mind maps pour le test
    const testMindMaps = Array(50)
      .fill(0)
      .map((_, i) => ({
        ...TestFixtures.basicMindMap(),
        id: `concurrent-id-${i}`,
        topic: `Concurrent Topic ${i}`,
        createdAt: new Date().toISOString()
      }))

    // Créer un mélange d'opérations de lecture et d'écriture
    const operations = []

    // Ajouter des opérations d'écriture
    operations.push(...testMindMaps.map((m) => storageService.storeMindMap(m)))

    // Ajouter des opérations de lecture avec différents offsets
    for (let i = 0; i < 20; i++) {
      operations.push(storageService.getAllMindMaps(i % 10, 5))
    }

    // Exécuter toutes les opérations de manière concurrente
    await Promise.all(operations)

    // Vérifier l'intégrité des données après les opérations concurrentes
    const allMindMaps = await storageService.getAllMindMaps(0, 100)

    expect(allMindMaps.total).toBe(50)

    // Vérifier que chaque mind map est stocké correctement
    for (let i = 0; i < 50; i++) {
      const topic = `Concurrent Topic ${i}`
      const storedMap = allMindMaps.mindMaps.find((m) => m.topic === topic)
      expect(storedMap).toBeDefined()
      expect(storedMap?.id).toBe(`concurrent-id-${i}`)
    }
  })
})
