import pLimit from 'p-limit'
import {
  ProcessingResult,
  PaginatedResponse,
  MindMap,
  IStorageService
} from '../types/index.js'
import CSVService from './csv.service.js'
import OpenAIService from './openai.service.js'
import { FastifyBaseLogger } from 'fastify'
import pRetry, { Options } from 'p-retry'
import AjvBuilder from 'ajv'
import { MindMapSchema } from '../schemas/index.js'
import ValidationService, { ValidationError } from './validation.service.js'

const Ajv = AjvBuilder.default || AjvBuilder

export class MindMapService {
  constructor(
    private readonly csvService: typeof CSVService,
    private readonly openaiService: OpenAIService,
    private readonly storageService: IStorageService,
    private readonly logger: FastifyBaseLogger | Console = console,
    private readonly retryOptions: Options = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: () => {}
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

  /**
   * Initialise le service et ses dépendances
   */
  async init(): Promise<void> {
    this.logger.info('Initializing MindMap service')
    await this.storageService.initBucket()
    this.logger.info('MindMap service initialized successfully')
  }

  /**
   * Traite les mind maps à partir du fichier CSV d'entrée
   *
   * @param inputCsvPath - Chemin du fichier CSV d'entrée
   * @param outputCsvPath - Chemin du fichier CSV de sortie
   * @param maxConcurrent - Nombre maximum de traitements concurrents
   * @returns Résultats du traitement
   */
  async processMindMaps(
    inputCsvPath: string,
    outputCsvPath: string,
    maxConcurrent: number = 5
  ): Promise<ProcessingResult[]> {
    this.logger.info(
      `Starting mind map generation - Input: ${inputCsvPath}, Output: ${outputCsvPath}`
    )

    const inputRows = await this.csvService.readInputCSV(inputCsvPath)
    this.logger.info(`Loaded ${inputRows.length} rows`)

    const limit = pLimit(maxConcurrent)

    const allResults = await Promise.all(
      inputRows.map((row) =>
        limit(async (): Promise<ProcessingResult> => {
          try {
            try {
              ValidationService.validateCSVInputRowOrThrow(row)
            } catch (error) {
              return {
                topic: row.topic || 'Unknown',
                status: 'Failure',
                error:
                  error instanceof ValidationError
                    ? error.message
                    : 'Invalid input row structure'
              }
            }

            this.logger.info(
              `Generating mind map for: ${row.subject} - ${row.topic}`
            )

            const mindMap: MindMap = await Promise.race([
              pRetry(
                () =>
                  this.openaiService.generateMindMap(row.subject, row.topic),
                {
                  ...this.retryOptions,
                  onFailedAttempt: (err) => {
                    this.logger.warn(
                      `Attempt ${err.attemptNumber} failed for ${row.topic}: ${err.message}`
                    )
                  }
                }
              ),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('Request timeout after 30 seconds')),
                  30000
                )
              )
            ])

            try {
              ValidationService.validateMindMapOrThrow(mindMap)
            } catch (error) {
              if (error instanceof ValidationError) {
                throw new Error(
                  `Invalid mind map structure: ${JSON.stringify(error.errors)}`
                )
              }
              throw error
            }

            await this.storageService.storeMindMap(mindMap)

            return { topic: row.topic, status: 'Success' }
          } catch (err) {
            this.logger.error(
              `Failed to process topic: ${row.topic}, subject: ${
                row.subject || 'undefined'
              }`,
              err
            )
            return {
              topic: row.topic || 'Unknown',
              status: 'Failure',
              error: err instanceof Error ? err.message : 'Unknown error'
            }
          }
        })
      )
    )

    await this.csvService.writeOutputCSV(outputCsvPath, allResults)
    this.logger.info('Mind map generation complete')
    return allResults
  }

  /**
   * Récupère tous les mind maps avec pagination
   *
   * @param offset - Position de départ pour la pagination
   * @param limit - Nombre maximum d'éléments à retourner
   * @returns Mind maps paginés
   */
  async getAllMindMaps(offset = 0, limit = 100): Promise<PaginatedResponse> {
    this.logger.info(`Fetching mind maps: offset=${offset}, limit=${limit}`)
    const response = await this.storageService.getAllMindMaps(offset, limit)
    this.logger.info(`Retrieved ${response.mindMaps.length}/${response.total}`)
    return response
  }
}

export default MindMapService
