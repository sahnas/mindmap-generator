import { Storage } from '@google-cloud/storage'
import { IStorageService, MindMap } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'

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
      throw error
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
      throw error
    }
  }

  async getAllMindMaps(
    offset = 0,
    limit = 100
  ): Promise<{ mindMaps: MindMap[]; total: number; hasMore: boolean }> {
    try {
      const [files] = await this.storage.bucket(this.bucketName).getFiles()
      const jsonFiles = files.filter((file) => file.name.endsWith('.json'))

      const total = jsonFiles.length
      const paginatedFiles = jsonFiles.slice(offset, offset + limit)

      const mindMaps: MindMap[] = []

      for (const file of paginatedFiles) {
        const [content] = await file.download()
        const mindMap = JSON.parse(content.toString())
        mindMaps.push(mindMap)
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

export default StorageService
