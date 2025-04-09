import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { MindMapService } from '../src/services/mind-map.service.js'
import { CSVService } from '../src/services/csv.service.js'
import { MindMap } from '../src/types/index.js'

// Create a consistent mock for the OpenAI service
const mockGenerateMindMap = vi.fn()

// Mock the OpenAI service
vi.mock('../src/services/openai.service.js', () => {
  return {
    OpenAIService: vi.fn().mockImplementation(() => ({
      generateMindMap: mockGenerateMindMap
    })),
    ExternalAPIError: class ExternalAPIError extends Error {
      constructor(message: string, cause?: Error) {
        super(message)
        this.name = 'ExternalAPIError'
        this.cause = cause
      }
    }
  }
})

// Import the mocked OpenAI service
import { OpenAIService } from '../src/services/openai.service.js'
import { LocalStorageService } from '../src/services/local-storage.service.js'

describe('End-to-End Mind Map Generation', () => {
  const TEST_DIR = path.join(process.cwd(), 'test-data')
  const INPUT_CSV_PATH = path.join(TEST_DIR, 'input.csv')
  const OUTPUT_CSV_PATH = path.join(TEST_DIR, 'output.csv')
  const STORAGE_PATH = path.join(TEST_DIR, 'mindmaps')

  let mindMapService: MindMapService
  let csvService: CSVService
  let openaiService: OpenAIService
  let storageService: LocalStorageService

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!fs.existsSync(STORAGE_PATH)) {
      fs.mkdirSync(STORAGE_PATH, { recursive: true })
    }

    // Create test CSV
    const csvContent = 'subject,topic\nMathematics,Algebra\nPhysics,Mechanics'
    fs.writeFileSync(INPUT_CSV_PATH, csvContent)

    // Initialize services
    csvService = new CSVService()
    openaiService = new OpenAIService('fake-api-key')
    storageService = new LocalStorageService(STORAGE_PATH)

    const mockMindMap: MindMap = {
      id: 'test-id-1',
      subject: 'Mathematics',
      topic: 'Algebra',
      root: {
        id: 'root-1',
        text: 'Algebra',
        children: [
          {
            id: 'child-1',
            text: 'Equations',
            children: [
              { id: 'child-1-1', text: 'Linear Equations' },
              { id: 'child-1-2', text: 'Quadratic Equations' }
            ]
          }
        ]
      },
      createdAt: new Date().toISOString()
    }

    // Setup mock responses
    mockGenerateMindMap.mockImplementation((subject, topic) => {
      if (topic === 'Algebra') {
        return Promise.resolve({
          ...mockMindMap,
          subject,
          topic
        })
      } else if (topic === 'Mechanics') {
        return Promise.resolve({
          ...mockMindMap,
          id: 'test-id-2',
          subject,
          topic,
          root: {
            ...mockMindMap.root,
            id: 'root-2',
            text: 'Mechanics',
            children: [
              {
                id: 'child-2',
                text: 'Forces',
                children: [{ id: 'child-2-1', text: "Newton's Laws" }]
              }
            ]
          }
        })
      } else {
        return Promise.reject(new Error(`Unknown topic: ${topic}`))
      }
    })

    // Initialize mind map service with mocked dependencies
    mindMapService = new MindMapService(
      csvService,
      openaiService,
      storageService,
      console,
      {
        retries: 1,
        factor: 1,
        minTimeout: 10,
        maxTimeout: 100,
        onFailedAttempt: () => {}
      }
    )

    await storageService.initBucket()
  })

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(INPUT_CSV_PATH)) {
      fs.unlinkSync(INPUT_CSV_PATH)
    }
    if (fs.existsSync(OUTPUT_CSV_PATH)) {
      fs.unlinkSync(OUTPUT_CSV_PATH)
    }
    if (fs.existsSync(STORAGE_PATH)) {
      fs.rmSync(STORAGE_PATH, { recursive: true, force: true })
    }
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should process input CSV and generate mind maps successfully', async () => {
    const results = await mindMapService.processMindMaps(
      INPUT_CSV_PATH,
      OUTPUT_CSV_PATH
    )

    // Verify processing results
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ topic: 'Algebra', status: 'Success' })
    expect(results[1]).toEqual({ topic: 'Mechanics', status: 'Success' })

    // Verify OpenAI was called correctly
    expect(mockGenerateMindMap).toHaveBeenCalledTimes(2)
    expect(mockGenerateMindMap).toHaveBeenCalledWith('Mathematics', 'Algebra')
    expect(mockGenerateMindMap).toHaveBeenCalledWith('Physics', 'Mechanics')

    // Verify output CSV was created
    expect(fs.existsSync(OUTPUT_CSV_PATH)).toBe(true)
    const outputContent = fs.readFileSync(OUTPUT_CSV_PATH, 'utf-8')
    expect(outputContent).toContain('topic,status')
    expect(outputContent).toContain('Algebra,Success')
    expect(outputContent).toContain('Mechanics,Success')

    // Verify storage contains the mind maps
    const { mindMaps } = await storageService.getAllMindMaps()
    expect(mindMaps).toHaveLength(2)

    // Verify first mind map
    const algebraMap = mindMaps.find((m) => m.topic === 'Algebra')
    expect(algebraMap).toBeDefined()
    expect(algebraMap?.subject).toBe('Mathematics')
    expect(algebraMap?.root.text).toBe('Algebra')
    expect(algebraMap?.root.children?.[0].text).toBe('Equations')

    // Verify second mind map
    const mechanicsMap = mindMaps.find((m) => m.topic === 'Mechanics')
    expect(mechanicsMap).toBeDefined()
    expect(mechanicsMap?.subject).toBe('Physics')
    expect(mechanicsMap?.root.text).toBe('Mechanics')
    expect(mechanicsMap?.root.children?.[0].text).toBe('Forces')
  })

  it('should handle OpenAI failures gracefully', async () => {
    // Modify the CSV to include a topic that will fail
    const csvContent = 'subject,topic\nMathematics,Algebra\nPhysics,Unknown'
    fs.writeFileSync(INPUT_CSV_PATH, csvContent)

    // Reset the mock implementation for this test
    mockGenerateMindMap.mockReset()

    // Make the Unknown topic fail
    mockGenerateMindMap.mockImplementation((subject, topic) => {
      if (topic === 'Algebra') {
        return Promise.resolve({
          id: 'test-id-1',
          subject,
          topic,
          root: {
            id: 'root-1',
            text: 'Algebra',
            children: []
          },
          createdAt: new Date().toISOString()
        })
      } else {
        return Promise.reject(
          new Error(`Failed to generate mind map for ${topic}`)
        )
      }
    })

    const results = await mindMapService.processMindMaps(
      INPUT_CSV_PATH,
      OUTPUT_CSV_PATH
    )

    // Verify processing results
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ topic: 'Algebra', status: 'Success' })
    expect(results[1]).toEqual({
      topic: 'Unknown',
      status: 'Failure',
      error: 'Failed to generate mind map for Unknown'
    })

    // Verify output CSV contains failure
    const outputContent = fs.readFileSync(OUTPUT_CSV_PATH, 'utf-8')
    expect(outputContent).toContain('Algebra,Success')
    expect(outputContent).toContain('Unknown,Failure')

    // Verify only the successful mind map was stored
    const { mindMaps } = await storageService.getAllMindMaps()
    expect(mindMaps).toHaveLength(1)
    expect(mindMaps[0].topic).toBe('Algebra')
  })

  it('should retry failed API calls', async () => {
    // Modify CSV for this test
    const csvContent = 'subject,topic\nMathematics,RetryTest'
    fs.writeFileSync(INPUT_CSV_PATH, csvContent)

    // Reset the mock implementation for this test
    mockGenerateMindMap.mockReset()

    // Setup mock to fail once then succeed
    let attemptCount = 0
    mockGenerateMindMap.mockImplementation((subject, topic) => {
      attemptCount++
      if (attemptCount === 1) {
        return Promise.reject(new Error('Temporary failure'))
      } else {
        return Promise.resolve({
          id: 'retry-test-id',
          subject,
          topic,
          root: {
            id: 'root-retry',
            text: topic,
            children: []
          },
          createdAt: new Date().toISOString()
        })
      }
    })

    const results = await mindMapService.processMindMaps(
      INPUT_CSV_PATH,
      OUTPUT_CSV_PATH
    )

    // Verify results
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ topic: 'RetryTest', status: 'Success' })

    // Verify it was called twice (initial failure + retry)
    expect(mockGenerateMindMap).toHaveBeenCalledTimes(2)

    // Verify the mind map was stored after successful retry
    const { mindMaps } = await storageService.getAllMindMaps()
    expect(mindMaps).toHaveLength(1)
    expect(mindMaps[0].topic).toBe('RetryTest')
  })
})
