import fs from 'fs'
import path from 'path'
import { parse, format } from 'fast-csv'
import { CSVInputRow, CSVOutputRow, ProcessingResult } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'
import {
  FileSystemError,
  ValidationError,
  StorageError
} from '../errors/error-types.js'
import { Storage } from '@google-cloud/storage'

export class CSVService {
  private logger: FastifyBaseLogger | Console

  constructor(
    private readonly storage?: Storage,
    logger?: FastifyBaseLogger
  ) {
    this.logger = logger || console
  }

  async readInputCSV(filePath: string): Promise<CSVInputRow[]> {
    const dir = path.dirname(filePath)

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (!fs.existsSync(filePath)) {
        throw new FileSystemError(
          'read',
          filePath,
          new Error(`Input CSV file not found: ${filePath}`)
        )
      }
    } catch (err) {
      if (err instanceof FileSystemError) {
        throw err
      }
      throw new FileSystemError(
        'initialize',
        filePath,
        err instanceof Error ? err : undefined
      )
    }

    return new Promise((resolve, reject) => {
      const rows: CSVInputRow[] = []

      fs.createReadStream(filePath)
        .pipe(parse({ headers: true, trim: true }))
        .on('error', (error) => {
          reject(
            new ValidationError(
              `Failed to parse CSV file: ${error.message}`,
              undefined,
              error,
              { filePath }
            )
          )
        })
        .on('data', (row: CSVInputRow) => {
          if (!row.subject?.trim() || !row.topic?.trim()) {
            reject(
              new ValidationError(
                'CSV row is missing required fields',
                undefined,
                undefined,
                { invalidRow: row }
              )
            )
            return
          }
          rows.push(row)
        })
        .on('end', () => {
          this.logger.info(
            `Successfully read ${rows.length} rows from ${filePath}`
          )
          resolve(rows)
        })
    })
  }

  async writeOutputCSV(
    filePath: string,
    results: ProcessingResult[]
  ): Promise<void> {
    this.logger.info(
      `Attempting to write ${results.length} results to: ${filePath}`
    )

    try {
      if (filePath.startsWith('gs://')) {
        await this.writeToGCS(filePath, results)
      } else {
        await this.writeToLocalFS(filePath, results)
      }
    } catch (err) {
      this.logger.error(
        { error: err },
        `Failed to write output CSV to ${filePath}`
      )
      if (err instanceof Error) {
        throw err
      }
      throw new Error(
        `An unknown error occurred while writing CSV to ${filePath}`
      )
    }
  }

  private async writeToGCS(
    filePath: string,
    results: ProcessingResult[]
  ): Promise<void> {
    if (!this.storage) {
      throw new StorageError(
        'write',
        'Storage client is not available for GCS operation'
      )
    }

    const { bucketName, objectPath } = this.parseGcsPath(filePath)
    const csvString = await this.formatResultsToCsvString(results)

    try {
      const file = this.storage.bucket(bucketName).file(objectPath)
      await file.save(csvString, { contentType: 'text/csv' })
      this.logger.info(
        `Successfully wrote ${results.length} rows to GCS: ${filePath}`
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      throw new StorageError(
        'write',
        `Failed to write to GCS: ${errorMessage}`,
        err instanceof Error ? err : undefined
      )
    }
  }

  private async writeToLocalFS(
    filePath: string,
    results: ProcessingResult[]
  ): Promise<void> {
    const dir = path.dirname(filePath)
    try {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
        this.logger.debug(`Created directory for local CSV output: ${dir}`)
      }

      const outputRows = results.map(({ topic, status }) => ({ topic, status }))
      await this.writeCSVData(filePath, outputRows)
      this.logger.info(
        `Successfully wrote ${results.length} rows to local file: ${filePath}`
      )
    } catch (err) {
      throw new FileSystemError(
        'write',
        filePath,
        err instanceof Error ? err : undefined
      )
    }
  }

  private parseGcsPath(filePath: string): {
    bucketName: string
    objectPath: string
  } {
    try {
      const url = new URL(filePath)
      return {
        bucketName: url.hostname,
        objectPath: url.pathname.substring(1)
      }
    } catch (err) {
      throw new StorageError(
        'parse',
        `Invalid GCS path: ${filePath}`,
        err instanceof Error ? err : undefined
      )
    }
  }

  private async formatResultsToCsvString(
    results: ProcessingResult[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let csvString = ''
      const csvStream = format({ headers: true, includeEndRowDelimiter: true })

      csvStream.on('data', (chunk) => (csvString += chunk))
      csvStream.on('end', () => resolve(csvString))
      csvStream.on('error', (err) =>
        reject(new StorageError('format', 'CSV formatting failed', err))
      )

      if (results.length === 0) {
        csvStream.write({ topic: '', status: '' })
      } else {
        results.forEach(({ topic, status }) =>
          csvStream.write({ topic, status })
        )
      }
      csvStream.end()
    })
  }

  private async writeCSVData(
    filePath: string,
    rows: CSVOutputRow[]
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath)
      const csvStream = format({
        headers: true,
        includeEndRowDelimiter: true
      })

      writeStream.on('error', reject)
      csvStream.on('error', reject)

      writeStream.on('finish', resolve)

      csvStream.pipe(writeStream)

      if (rows.length === 0) {
        csvStream.write({ topic: '', status: '' })
      } else {
        rows.forEach((row) => csvStream.write(row))
      }

      csvStream.end()
    })
  }
}
