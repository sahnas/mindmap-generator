import AjvBuilder, { ErrorObject } from 'ajv'
import { MindMapSchema } from '../schemas/index.js'
import { MindMap, RawMindMapData, CSVInputRow } from '../types/index.js'

const Ajv = AjvBuilder.default || AjvBuilder

/**
 * Erreur spécifique pour les problèmes de validation
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errors?: ErrorObject[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Service centralisé pour la validation des données
 */
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

  /**
   * Valide un objet MindMap par rapport au schéma défini
   *
   * @param data - Données à valider
   * @returns true si valide, sinon false
   */
  static validateMindMap(data: unknown): data is MindMap {
    const isValid = this.mindMapValidator(data)
    return isValid
  }

  /**
   * Valide un objet MindMap et lance une erreur en cas d'échec
   *
   * @param data - Données à valider
   * @throws ValidationError si la validation échoue
   */
  static validateMindMapOrThrow(data: unknown): asserts data is MindMap {
    const isValid = this.validateMindMap(data)

    if (!isValid) {
      throw new ValidationError(
        'Invalid mind map structure',
        this.mindMapValidator.errors || undefined
      )
    }
  }

  /**
   * Valide les données brutes reçues de l'API OpenAI
   *
   * @param data - Données brutes à valider
   * @returns true si valide, sinon false
   */
  static validateRawMindMapData(data: unknown): data is RawMindMapData {
    if (!data || typeof data !== 'object') return false

    const typedData = data as Record<string, unknown>

    if (!typedData.root || typeof typedData.root !== 'object') return false

    const root = typedData.root as Record<string, unknown>

    if (typeof root.text !== 'string') return false

    if (root.children !== undefined) {
      if (!Array.isArray(root.children)) return false

      // Validation récursive des enfants
      for (const child of root.children) {
        if (!this.validateRawMindMapNode(child)) return false
      }
    }

    return true
  }

  /**
   * Valide un nœud brut reçu de l'API OpenAI
   *
   * @param node - Nœud à valider
   * @returns true si valide, sinon false
   */
  private static validateRawMindMapNode(node: unknown): boolean {
    if (!node || typeof node !== 'object') return false

    const typedNode = node as Record<string, unknown>

    if (typeof typedNode.text !== 'string') return false

    if (typedNode.children !== undefined) {
      if (!Array.isArray(typedNode.children)) return false

      for (const child of typedNode.children) {
        if (!this.validateRawMindMapNode(child)) return false
      }
    }

    return true
  }

  /**
   * Valide un objet CSVInputRow par rapport au schéma défini
   *
   * @param data - Données à valider
   * @returns true si valide, sinon false
   */
  static validateCSVInputRow(data: unknown): data is CSVInputRow {
    return this.csvInputRowValidator(data)
  }

  /**
   * Valide un objet CSVInputRow et lance une erreur en cas d'échec
   *
   * @param data - Données à valider
   * @throws ValidationError si la validation échoue
   */
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
