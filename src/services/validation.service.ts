import AjvBuilder, { ErrorObject } from 'ajv'
import { MindMapSchema, RawMindMapDataSchema } from '../schemas/index.js'
import { MindMap, RawMindMapData, CSVInputRow } from '../types/index.js'

const Ajv = AjvBuilder.default || AjvBuilder

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors?: ErrorObject[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class ValidationService {
  private static ajv = new Ajv({
    allErrors: true,
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    allowUnionTypes: true
  })

  private static readonly CSVInputRowSchema = {
    type: 'object',
    properties: {
      subject: { type: 'string', minLength: 1 },
      topic: { type: 'string', minLength: 1 }
    },
    required: ['subject', 'topic'],
    additionalProperties: false
  }

  private static mindMapValidator = this.ajv.compile(MindMapSchema)
  private static csvInputRowValidator = this.ajv.compile(this.CSVInputRowSchema)
  private static rawMindMapDataValidator =
    this.ajv.compile(RawMindMapDataSchema)

  static validateMindMap(data: unknown): data is MindMap {
    const isValid = this.mindMapValidator(data)
    return isValid
  }

  static validateMindMapOrThrow(data: unknown): asserts data is MindMap {
    const isValid = this.validateMindMap(data)

    if (!isValid) {
      throw new ValidationError(
        'Invalid mind map structure',
        this.mindMapValidator.errors || undefined
      )
    }
  }

  static validateRawMindMapData(data: unknown): data is RawMindMapData {
    return this.rawMindMapDataValidator(data)
  }

  static validateCSVInputRow(data: unknown): data is CSVInputRow {
    return this.csvInputRowValidator(data)
  }

  static validateCSVInputRowOrThrow(
    data: unknown
  ): asserts data is CSVInputRow {
    const isValid = this.validateCSVInputRow(data)
    if (!isValid) {
      throw new ValidationError(
        'Invalid CSV input row structure',
        this.csvInputRowValidator.errors || undefined
      )
    }
  }
}

export default ValidationService
