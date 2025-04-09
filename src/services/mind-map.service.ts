import pLimit from 'p-limit'
import {
  ProcessingResult,
  MindMap,
  IStorageService,
  CSVInputRow
} from '../types/index.js'
import { CSVService } from './csv.service.js'

import { IMindMapGenerator } from '../interfaces/mindmap-generator.interface.js'
import { FastifyBaseLogger } from 'fastify'
import pRetry, { Options } from 'p-retry'
import AjvBuilder from 'ajv'
import { MindMapSchema } from '../schemas/index.js'
import ValidationService, { ValidationError } from './validation.service.js'

const Ajv = AjvBuilder.default || AjvBuilder

export class MindMapService {
  constructor(
    private readonly csvService: CSVService,
    private readonly mindMapGenerator: IMindMapGenerator,
    private readonly storageService: IStorageService,
    private readonly logger: FastifyBaseLogger | Console = console,
    private readonly retryOptions: Options = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      shouldRetry: (error) => !(error instanceof ValidationError)
    }
  ) {}

  private ajv = new Ajv({
    allErrors: true,
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    allowUnionTypes: true
  })
  private validateMindMap = this.ajv.compile(MindMapSchema)

  async init(): Promise<void> {
    this.logger.info('Initializing MindMap service')
    await this.storageService.initBucket()
    this.logger.info('MindMap service initialized successfully')
  }

  async processMindMaps(
    inputCsvPath: string,
    outputCsvPath: string,
    maxConcurrent: number = 5,
    batchSize: number = 100
  ): Promise<ProcessingResult[]> {
    this.logger.info(
      `Starting mind map generation - Input: ${inputCsvPath}, Output: ${outputCsvPath}`
    )

    const inputRows = await this.csvService.readInputCSV(inputCsvPath)
    this.logger.info(`Loaded ${inputRows.length} rows`)

    const limit = pLimit(maxConcurrent)
    let allResults: ProcessingResult[] = []

    try {
      const chunks = Array.from({
        length: Math.ceil(inputRows.length / batchSize)
      }).map((_, i) => inputRows.slice(i * batchSize, (i + 1) * batchSize))

      let processedRowCount = 0
      for (const [index, batch] of chunks.entries()) {
        this.logger.info(`Processing batch ${index + 1}/${chunks.length}`)

        const batchResults = await Promise.all(
          batch.map(async (row) => {
            const result = await limit(() => this.processRow(row))

            return result
          })
        )

        allResults = [...allResults, ...batchResults]
        processedRowCount += batch.length

        if (batch.length > 0) {
          const partialFileName = `output_results.csv.partial.${processedRowCount}`
          const partialFilePath = `/tmp/${partialFileName}`

          try {
            await this.csvService.writeOutputCSV(partialFilePath, allResults)

            this.logger.info(
              `Wrote partial results for ${allResults.length} rows to ${partialFilePath}`
            )
          } catch (partialWriteError) {
            this.logger.error(
              { err: partialWriteError, file: partialFilePath },
              `Failed to write partial results file, continuing processing...`
            )
          }
        }
      }

      await this.csvService.writeOutputCSV(outputCsvPath, allResults)
      this.logger.info('Mind map generation complete, final results written.')
    } catch (error) {
      this.logger.error(
        { err: error },
        'A critical error occurred during mind map processing, final CSV might not be written.'
      )

      throw error
    }

    return allResults
  }

  private async processRow(row: CSVInputRow): Promise<ProcessingResult> {
    const topic = row.topic || 'Unknown Topic'
    const subject = row.subject || 'Unknown Subject'

    try {
      ValidationService.validateCSVInputRowOrThrow(row)
    } catch (validationError) {
      this.logger.warn(
        { err: validationError, row },
        `Invalid input row structure for topic: ${topic}`
      )
      return {
        topic: topic,
        status: 'Failure',
        error:
          validationError instanceof Error
            ? validationError.message
            : 'Invalid input row structure'
      }
    }

    this.logger.info(`Generating mind map for: ${subject} - ${topic}`)

    try {
      const mindMap: MindMap = await pRetry(
        () => this.mindMapGenerator.generateMindMap(subject, topic),
        { ...this.retryOptions }
      )

      ValidationService.validateMindMapOrThrow(mindMap)

      const storedFileName = await this.storageService.storeMindMap(mindMap)
      this.logger.info(
        `Successfully generated, validated, and stored mind map for ${subject} - ${topic} as ${storedFileName}`
      )

      return { topic, status: 'Success' }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.logger.error(
        { errorDetails: error, subject, topic },
        `Failed to process topic ${topic} fully`
      )
      return {
        topic,
        status: 'Failure',
        error: error.message || 'Unknown processing error for this topic'
      }
    }
  }

  private validateInputRow(row: CSVInputRow): ProcessingResult | null {
    try {
      ValidationService.validateCSVInputRowOrThrow(row)
      return null
    } catch (error) {
      this.logger.error(
        `Invalid input row for topic: ${row.topic || 'Unknown'}`,
        error
      )
      return {
        topic: row.topic || 'Unknown',
        status: 'Failure',
        error:
          error instanceof ValidationError
            ? error.message
            : 'Invalid input row structure'
      }
    }
  }

  private validateMindMapResult(mindMap: MindMap): ProcessingResult | null {
    if (!this.validateMindMap(mindMap)) {
      const errors = this.validateMindMap.errors || []
      this.logger.error(
        `Invalid mind map for topic: ${mindMap.topic || 'Unknown'}`,
        errors
      )
      return {
        topic: mindMap.topic || 'Unknown',
        status: 'Failure',
        error: `Invalid mind map structure: ${JSON.stringify(errors)}`
      }
    }
    return null
  }

  async getAllMindMaps(pageToken?: string, limit?: number) {
    try {
      return await this.storageService.getAllMindMaps(pageToken, limit)
    } catch (error) {
      this.logger.error('Error getting all mind maps:', error)
      throw error
    }
  }
}

export default MindMapService
