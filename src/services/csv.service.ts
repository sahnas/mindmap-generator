import fs from 'fs'
import path from 'path'
import { parse, format } from 'fast-csv'
import { CSVInputRow, CSVOutputRow, ProcessingResult } from '../types/index.js'
import { FastifyBaseLogger } from 'fastify'
import { FileSystemError, ValidationError } from '../errors/error-types.js'

export class CSVService {
  private logger: FastifyBaseLogger | Console

  constructor(logger?: FastifyBaseLogger) {
    this.logger = logger || console
  }

  /**
   * Lit et parse un fichier CSV d'entrée
   * @param filePath Chemin du fichier CSV à lire
   * @returns Un tableau des lignes du CSV
   * @throws FileSystemError si le fichier n'existe pas ou ne peut pas être lu
   * @throws ValidationError si le contenu du CSV n'est pas valide
   */
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
          // Validation des données
          if (!row.subject || !row.topic) {
            this.logger.warn(
              `Row with missing required fields: ${JSON.stringify(row)}`
            )
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

  /**
   * Écrit les résultats dans un fichier CSV
   * @param filePath Chemin où écrire le fichier CSV
   * @param results Résultats à écrire
   * @throws FileSystemError si le fichier ne peut pas être écrit
   */
  async writeOutputCSV(
    filePath: string,
    results: ProcessingResult[]
  ): Promise<void> {
    const dir = path.dirname(filePath)

    try {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
    } catch (err) {
      throw new FileSystemError(
        'create directory',
        dir,
        err instanceof Error ? err : undefined
      )
    }

    const outputRows: CSVOutputRow[] = results.map(({ topic, status }) => ({
      topic,
      status
    }))

    try {
      await this.writeCSVData(filePath, outputRows)
      this.logger.info(
        `Successfully wrote ${outputRows.length} rows to ${filePath}`
      )
    } catch (err) {
      throw new FileSystemError(
        'write',
        filePath,
        err instanceof Error ? err : undefined,
        { rowCount: outputRows.length }
      )
    }
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

export default new CSVService()
