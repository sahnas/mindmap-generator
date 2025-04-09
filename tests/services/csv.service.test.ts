import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import mockFs from 'mock-fs'
import fs from 'fs'
import { CSVService } from '../../src/services/csv.service.js'
import { FastifyBaseLogger } from 'fastify'
import { ProcessingResult } from 'types/index.js'
import { FileSystemError } from '../../src/errors/error-types.js'

const mockLogger: FastifyBaseLogger = {
  ...console,
  child: () => mockLogger,
  level: 'info',
  fatal: console.error,
  silent: console.log
}

const service = new CSVService(undefined, mockLogger)

const INPUT_PATH = 'data/input.csv'
const OUTPUT_PATH = 'data/output.csv'

const validCSV = `subject,topic
Mathematics,Math
Science,Physics`

describe('CSVService', () => {
  beforeEach(() => {
    mockFs({})
  })

  afterEach(() => {
    mockFs.restore()
  })

  describe('readInputCSV', () => {
    it('should parse a valid CSV file correctly', async () => {
      mockFs({
        'data/input.csv': validCSV
      })

      const rows = await service.readInputCSV(INPUT_PATH)
      expect(rows).toEqual([
        { subject: 'Mathematics', topic: 'Math' },
        { subject: 'Science', topic: 'Physics' }
      ])
    })

    it('should throw if file does not exist', async () => {
      const error = await service.readInputCSV(INPUT_PATH).catch((e) => e)

      expect(error).toBeInstanceOf(FileSystemError)
      expect(error.message).toMatch(/file not found|read failed/i)
    })

    it('should return empty array for empty file', async () => {
      mockFs({ 'data/input.csv': 'subject,topic\n' })
      const rows = await service.readInputCSV(INPUT_PATH)
      expect(rows).toEqual([])
    })

    it('should reject on malformed CSV', async () => {
      mockFs({
        'data/input.csv': 'topic,status\n"unterminated'
      })

      await expect(service.readInputCSV(INPUT_PATH)).rejects.toThrow()
    })
  })

  describe('writeOutputCSV', () => {
    it('should write a CSV file correctly', async () => {
      const data: ProcessingResult[] = [
        { topic: 'Math', status: 'Success' },
        { topic: 'Physics', status: 'Failure' }
      ]

      await service.writeOutputCSV(OUTPUT_PATH, data)

      const written = fs.readFileSync(OUTPUT_PATH, 'utf-8')
      expect(written).toContain('Math,Success')
      expect(written).toContain('Physics,Failure')
    })

    it('should create missing directories when writing', async () => {
      const data: ProcessingResult[] = [{ topic: 'Test', status: 'Success' }]

      await service.writeOutputCSV('nested/folder/output.csv', data)

      const exists = fs.existsSync('nested/folder/output.csv')
      expect(exists).toBe(true)
    })

    it('should handle large CSV files correctly', async () => {
      const largeCSVContent =
        'subject,topic\n' +
        Array(1000)
          .fill(0)
          .map((_, i) => `Subject${i},Topic${i}`)
          .join('\n')

      mockFs({
        'data/large_input.csv': largeCSVContent
      })

      const rows = await service.readInputCSV('data/large_input.csv')

      expect(rows.length).toBe(1000)
      expect(rows[999]).toEqual({ subject: 'Subject999', topic: 'Topic999' })
    })

    it('should handle special characters in CSV correctly', async () => {
      const specialCharsCSV =
        'subject,topic\n' +
        '"Math, Advanced","Algebra with commas, and quotes"""\n' +
        '"Physics","E=mc²; α, β, γ"\n' +
        '"Language","Español, Français, 日本語"'

      mockFs({
        'data/special_chars.csv': specialCharsCSV
      })

      const rows = await service.readInputCSV('data/special_chars.csv')

      expect(rows).toEqual([
        {
          subject: 'Math, Advanced',
          topic: 'Algebra with commas, and quotes"'
        },
        { subject: 'Physics', topic: 'E=mc²; α, β, γ' },
        { subject: 'Language', topic: 'Español, Français, 日本語' }
      ])
    })
  })
})
