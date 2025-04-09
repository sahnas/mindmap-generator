import { Storage, GetFilesOptions } from '@google-cloud/storage'
import { IStorageService, MindMap, PaginatedResponse } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'
import ValidationService from './validation.service.js'
import { StorageServiceError } from '../errors/error-types.js'

export class StorageService implements IStorageService {
  private storage: Storage
  private bucketName: string
  private logger: FastifyBaseLogger | Console

  constructor(
    projectId: string,
    bucketName: string,
    keyFilename?: string,
    logger?: FastifyBaseLogger
  ) {
    const options: { projectId: string; keyFilename?: string } = { projectId }

    if (keyFilename) {
      options.keyFilename = keyFilename
    }

    this.storage = new Storage(options)
    this.bucketName = bucketName
    this.logger = logger || console
  }

  async initBucket(): Promise<void> {
    try {
      const [bucketExists] = await this.storage.bucket(this.bucketName).exists()
      if (!bucketExists) {
        await this.storage.createBucket(this.bucketName)
        this.logger.info(`Bucket ${this.bucketName} created.`)
      }
    } catch (error) {
      this.logger.error('Error initializing bucket:', error)
      throw new StorageServiceError(
        'init',
        'Failed to initialize GCS bucket',
        error instanceof Error ? error : undefined,
        { bucketName: this.bucketName }
      )
    }
  }

  async storeMindMap(mindMap: MindMap): Promise<string> {
    try {
      const fileName = `${mindMap.subject.replace(/\s+/g, '_')}_${mindMap.topic.replace(/\s+/g, '_')}_${mindMap.id}.json`

      const file = this.storage.bucket(this.bucketName).file(fileName)

      await file.save(JSON.stringify(mindMap, null, 2), {
        contentType: 'application/json',
        metadata: {
          subject: mindMap.subject,
          topic: mindMap.topic
        }
      })

      return fileName
    } catch (error) {
      this.logger.error('Error storing mind map:', error)
      throw new StorageServiceError(
        'store',
        'Failed to store mind map in GCS',
        error instanceof Error ? error : undefined,
        { bucketName: this.bucketName, mindMapId: mindMap.id }
      )
    }
  }

  async getAllMindMaps(
    pageToken?: string,
    limit = 100
  ): Promise<PaginatedResponse> {
    this.logger.info(
      `Fetching mind maps from GCS: limit=${limit}, pageToken=${pageToken ? 'provided' : 'first page'}`
    )

    try {
      const options: GetFilesOptions = {
        maxResults: limit,
        pageToken: pageToken,
        autoPaginate: false
      }

      const [files, nextQuery] = await this.storage
        .bucket(this.bucketName)
        .getFiles(options)

      const jsonFiles = files.filter((file) => file.name.endsWith('.json'))
      const mindMaps: MindMap[] = []

      const downloadPromises = jsonFiles.map(async (file) => {
        try {
          const [content] = await file.download()
          const mindMap = JSON.parse(content.toString())
          try {
            ValidationService.validateMindMapOrThrow(mindMap)
            return {
              status: 'fulfilled',
              value: mindMap,
              fileName: file.name
            } as const
          } catch (validationError) {
            this.logger.error(
              `Mind map validation failed for ${file.name}:`,
              validationError
            )
            return {
              status: 'rejected',
              reason: validationError,
              fileName: file.name,
              errorType: 'validation'
            } as const
          }
        } catch (downloadError) {
          this.logger.error(
            `Failed to download or parse file ${file.name}:`,
            downloadError
          )
          return {
            status: 'rejected',
            reason: downloadError,
            fileName: file.name,
            errorType: 'download'
          } as const
        }
      })

      const results = await Promise.allSettled(downloadPromises)

      results.forEach((result) => {
        if (
          result.status === 'fulfilled' &&
          result.value.status === 'fulfilled'
        ) {
          mindMaps.push(result.value.value)
        }
      })

      return {
        mindMaps,
        nextPageToken: nextQuery?.pageToken
      }
    } catch (error) {
      this.logger.error('Error retrieving mind maps list from GCS:', error)
      throw new StorageServiceError(
        'list',
        'Failed to retrieve mind maps from GCS',
        error instanceof Error ? error : undefined,
        { bucketName: this.bucketName, pageToken, limit }
      )
    }
  }
}

export default StorageService
