import OpenAI from 'openai'
import {
  MindMap,
  MindMapNode,
  RawMindMapData,
  RawMindMapNode
} from '../types/index.js'
import { ValidationService } from './validation.service.js'
import {
  ExternalAPIError,
  ValidationError,
  TimeoutError
} from '../errors/error-types.js'
import crypto from 'crypto'
import { FastifyBaseLogger } from 'fastify'

export class OpenAIService {
  private openai: OpenAI
  private logger: FastifyBaseLogger | Console

  constructor(apiKey: string, logger?: FastifyBaseLogger) {
    this.openai = new OpenAI({ apiKey })
    this.logger = logger || console
  }

  private getMindMapDataStructure(): string {
    return JSON.stringify(
      {
        root: {
          text: 'Main Topic',
          children: [
            {
              text: 'Subtopic 1',
              children: [{ text: 'Detail 1' }, { text: 'Detail 2' }]
            },
            {
              text: 'Subtopic 2',
              children: [{ text: 'Detail 3' }, { text: 'Detail 4' }]
            }
          ]
        }
      },
      null,
      2
    )
  }

  async generateMindMap(subject: string, topic: string): Promise<MindMap> {
    this.logger.info(
      `Generating mind map for subject: ${subject}, topic: ${topic}`
    )

    const prompt = `You are a professional teacher in ${subject}.
Your goal is to generate a mind map for the subject above with the focus on the ${topic} so that a student can improve their understanding of ${subject} and ${topic} while using that mind map.
The mind map should feature sub-topics of the ${topic} and no other content.
The result of your work must be a mind map in the form of JSON using the following data structure:
${this.getMindMapDataStructure()}`

    this.logger.debug('Sending request to OpenAI')

    let responseContent: string | null | undefined
    try {
      // Ajouter un timeout explicite
      const timeoutMs = 30000
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new TimeoutError('OpenAI API call', timeoutMs)),
          timeoutMs
        )
      })

      const responsePromise = this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that creates mind maps in JSON format. Only respond with valid JSON.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })

      const response = await Promise.race([responsePromise, timeoutPromise])
      responseContent = response.choices[0]?.message?.content
    } catch (err) {
      this.logger.error('Error calling OpenAI API', err)

      if (err instanceof TimeoutError) {
        throw err
      }

      throw new ExternalAPIError(
        'OpenAI',
        'Failed to generate mind map',
        err instanceof Error ? err : undefined,
        { subject, topic }
      )
    }

    this.logger.debug('Received response from OpenAI')

    if (!responseContent) {
      throw new ExternalAPIError(
        'OpenAI',
        'No content returned from API',
        undefined,
        { subject, topic }
      )
    }

    try {
      let mindMapData: RawMindMapData
      try {
        mindMapData = JSON.parse(responseContent)
      } catch (parseError) {
        throw new ValidationError(
          'Invalid JSON response from OpenAI',
          undefined,
          parseError instanceof Error ? parseError : undefined,
          { responseContent }
        )
      }

      if (!ValidationService.validateRawMindMapData(mindMapData)) {
        throw new ValidationError(
          'Invalid mind map structure returned from OpenAI',
          undefined,
          undefined,
          { mindMapData }
        )
      }

      const mindMap: MindMap = {
        id: crypto.randomUUID(),
        subject,
        topic,
        root: this.processMindMapNode(mindMapData.root),
        createdAt: new Date().toISOString()
      }

      this.logger.info(
        `Successfully generated mind map for ${subject} - ${topic}`
      )
      return mindMap
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err
      }

      throw new ValidationError(
        'Failed to process OpenAI response',
        undefined,
        err instanceof Error ? err : undefined,
        { responseContent }
      )
    }
  }

  private processMindMapNode(node: RawMindMapNode): MindMapNode {
    const processedNode: MindMapNode = {
      id: crypto.randomUUID(),
      text: node.text
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      processedNode.children = node.children.map((child) =>
        this.processMindMapNode(child)
      )
    }

    return processedNode
  }
}

export default OpenAIService
