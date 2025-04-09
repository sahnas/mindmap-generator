import OpenAI from 'openai'
import {
  MindMap,
  MindMapNode,
  RawMindMapData,
  RawMindMapNode
} from '../types/index.js'
import { ValidationService } from './validation.service.js'
import { ExternalAPIError, ValidationError } from '../errors/error-types.js'
import crypto from 'crypto'
import { FastifyBaseLogger } from 'fastify'
import { IMindMapGenerator } from '../interfaces/mindmap-generator.interface.js'

export class OpenAIService implements IMindMapGenerator {
  private openai: OpenAI
  private logger: FastifyBaseLogger | Console

  constructor(apiKey: string, logger?: FastifyBaseLogger | Console) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required.')
    }
    this.openai = new OpenAI({ apiKey })
    this.logger = logger || console
  }

  private getMindMapDataStructure(): string {
    return JSON.stringify(
      {
        root: {
          text: 'Main Topic',
          children: [
            { text: 'Subtopic 1', children: [{ text: 'Detail 1' }] },
            { text: 'Subtopic 2' }
          ]
        }
      },
      null,
      2
    )
  }

  private extractJsonFromContent(content: string): RawMindMapData {
    try {
      const parsed = JSON.parse(content)
      if (ValidationService.validateRawMindMapData(parsed)) {
        return parsed
      }
      throw new ValidationError(
        'Initial JSON parse valid, but does not match RawMindMapData schema.'
      )
    } catch (initialParseError) {
      this.logger.debug(
        'Direct JSON parsing failed, attempting regex extraction.',
        initialParseError
      )

      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/)
      if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[2]
        try {
          const parsed = JSON.parse(potentialJson)
          if (ValidationService.validateRawMindMapData(parsed)) {
            this.logger.debug('JSON extracted and validated successfully.')
            return parsed
          }
          throw new ValidationError(
            'Extracted JSON parse valid, but does not match RawMindMapData schema.'
          )
        } catch (extractionParseError) {
          this.logger.error('Failed to parse extracted JSON.', {
            error: extractionParseError,
            extracted: potentialJson
          })
          throw new ValidationError(
            'Failed to parse extracted JSON from OpenAI response',
            undefined,
            extractionParseError instanceof Error
              ? extractionParseError
              : undefined,
            { content }
          )
        }
      }
      this.logger.error('No valid JSON structure found in OpenAI response.', {
        content
      })
      throw new ValidationError(
        'No valid JSON structure found in OpenAI response',
        undefined,
        initialParseError instanceof Error ? initialParseError : undefined,
        { content }
      )
    }
  }

  async generateMindMap(subject: string, topic: string): Promise<MindMap> {
    this.logger.info(
      `Generating mind map via OpenAI for subject: ${subject}, topic: ${topic}`
    )

    const prompt = `You are a professional teacher in ${subject}.
Your goal is to generate a mind map for the subject above with the focus on the ${topic} so that a student can improve their understanding of ${subject} and ${topic} while using that mind map.
The mind map should feature sub-topics of the ${topic} and no other content.
The result of your work must be a mind map in the form of JSON using the following data structure:
${this.getMindMapDataStructure()}
Respond ONLY with the JSON structure, without any introductory text or markdown formatting.`

    this.logger.debug('Sending request to OpenAI')
    let responseContent: string | null | undefined

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content:
                'You are an assistant that generates mind maps in JSON format. Only output the raw JSON.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        },
        {
          timeout: 30000
        }
      )
      responseContent = response.choices[0]?.message?.content
      this.logger.debug('Received response from OpenAI')
    } catch (err) {
      this.logger.error({ errorDetails: err }, 'Error calling OpenAI API')

      throw new ExternalAPIError(
        'OpenAI',
        err instanceof Error
          ? err.message
          : 'Failed to communicate with OpenAI API',
        err instanceof Error ? err : undefined,
        { subject, topic }
      )
    }

    if (!responseContent) {
      this.logger.error('No content returned from OpenAI API', {
        subject,
        topic
      })
      throw new ExternalAPIError(
        'OpenAI',
        'No content returned from API',
        undefined,
        { subject, topic }
      )
    }

    try {
      const mindMapData = this.extractJsonFromContent(responseContent)
      const mindMap: MindMap = {
        id: crypto.randomUUID(),
        subject,
        topic,
        root: this.processMindMapNode(mindMapData.root),
        createdAt: new Date().toISOString()
      }

      ValidationService.validateMindMapOrThrow(mindMap)

      this.logger.info(
        `Successfully generated and validated mind map for ${subject} - ${topic}`
      )
      return mindMap
    } catch (err) {
      this.logger.error('Failed to process or validate OpenAI response', {
        error: err,
        responseContent
      })

      if (err instanceof ValidationError || err instanceof ExternalAPIError) {
        throw err
      }

      throw new ValidationError(
        'Failed to process OpenAI response into valid MindMap structure',
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
      processedNode.children = node.children
        .filter((child) => child && typeof child.text === 'string')
        .map((child) => this.processMindMapNode(child))
    }

    return processedNode
  }
}

export default OpenAIService
