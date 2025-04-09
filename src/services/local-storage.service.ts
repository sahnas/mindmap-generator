import fs from 'fs'
import path from 'path'
import { IStorageService, MindMap, PaginatedResponse } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'

export class LocalStorageService implements IStorageService {
  private storagePath: string
  private logger: FastifyBaseLogger | Console

  constructor(storagePath: string, logger?: FastifyBaseLogger) {
    this.storagePath = storagePath
    this.logger = logger || console
    this.logger.info(
      `LocalStorageService initialized with path: ${this.storagePath}`
    )
  }

  async initBucket(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true })
        this.logger.info(`Storage directory ${this.storagePath} created.`)
      } else {
        this.logger.info(
          `Storage directory ${this.storagePath} already exists.`
        )
      }
    } catch (error) {
      this.logger.error('Error initializing storage directory:', error)
      throw error
    }
  }

  async storeMindMap(mindMap: MindMap): Promise<string> {
    try {
      const fileName = `${mindMap.subject.replace(/\s+/g, '_')}_${mindMap.topic.replace(/\s+/g, '_')}_${mindMap.id}.json`
      const filePath = path.join(this.storagePath, fileName)

      await fs.promises.writeFile(filePath, JSON.stringify(mindMap, null, 2))

      return fileName
    } catch (error) {
      this.logger.error('Error storing mind map:', error)
      throw error
    }
  }

  async getAllMindMaps(
    pageToken?: string,
    limit = 100
  ): Promise<PaginatedResponse> {
    let offset = 0
    if (pageToken) {
      const parsedOffset = parseInt(pageToken, 10)

      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset
      } else {
        this.logger.warn(
          `Invalid pageToken received: ${pageToken}. Defaulting to offset 0.`
        )
      }
    }

    this.logger.info(
      `Workspaceing mind maps locally: limit=${limit}, offset=${offset} (from pageToken: ${pageToken ?? 'none'})`
    )

    try {
      const mindMaps: MindMap[] = []

      if (!fs.existsSync(this.storagePath)) {
        this.logger.warn(`Storage path ${this.storagePath} does not exist.`)
        return { mindMaps: [], total: 0, nextPageToken: undefined }
      }

      const files = (await fs.promises.readdir(this.storagePath)).filter(
        (file) => typeof file === 'string' && file.endsWith('.json')
      )

      const total = files.length
      const currentOffset = Math.min(offset, total)
      const paginatedFiles = files.slice(currentOffset, currentOffset + limit)

      for (const file of paginatedFiles) {
        try {
          const filePath = path.join(this.storagePath, file)
          const content = await fs.promises.readFile(filePath, 'utf-8')
          const mindMap = JSON.parse(content) as MindMap

          mindMaps.push(mindMap)
        } catch (error) {
          this.logger.warn(
            `Error reading or parsing local mind map file ${file}:`,
            error
          )
        }
      }

      const nextOffset = currentOffset + paginatedFiles.length
      const nextPageToken = nextOffset < total ? String(nextOffset) : undefined

      return {
        mindMaps,
        total,
        nextPageToken
      }
    } catch (error) {
      this.logger.error('Error retrieving mind maps from local storage:', error)
      throw error
    }
  }
}

export default LocalStorageService
