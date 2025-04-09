import fs from 'fs'
import path from 'path'
import { MindMap, PaginatedResponse } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'

export class LocalStorageService {
  private storagePath: string
  private logger: FastifyBaseLogger | Console

  constructor(storagePath: string, logger?: FastifyBaseLogger) {
    this.storagePath = storagePath
    this.logger = logger || console
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

  async getAllMindMaps(offset = 0, limit = 100): Promise<PaginatedResponse> {
    try {
      const mindMaps: MindMap[] = []

      if (!fs.existsSync(this.storagePath)) {
        return { mindMaps: [], total: 0, hasMore: false }
      }

      const files = fs
        .readdirSync(this.storagePath)
        .filter((file) => file.endsWith('.json'))

      const total = files.length
      const paginatedFiles = files.slice(offset, offset + limit)

      for (const file of paginatedFiles) {
        try {
          const filePath = path.join(this.storagePath, file)
          const content = await fs.promises.readFile(filePath, 'utf-8')
          const mindMap = JSON.parse(content) as MindMap
          mindMaps.push(mindMap)
        } catch (error) {
          this.logger.warn(`Error reading mind map file ${file}:`, error)
        }
      }

      return {
        mindMaps,
        total,
        hasMore: offset + limit < total
      }
    } catch (error) {
      this.logger.error('Error retrieving mind maps:', error)
      throw error
    }
  }
}

export default LocalStorageService
