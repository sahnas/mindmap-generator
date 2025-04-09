import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenAIService } from '../../src/services/openai.service.js'
import OpenAI from 'openai'
import { FastifyBaseLogger } from 'fastify'

vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn().mockReturnValue('test-uuid')
  }
}))

const mockCreate = vi.fn()

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      } as Partial<OpenAI['chat']['completions']>
    }))
  }
})

describe('OpenAIService', () => {
  let openaiService: OpenAIService
  let mockLogger: Partial<FastifyBaseLogger>

  beforeEach(() => {
    mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() }
    mockCreate.mockReset()
    openaiService = new OpenAIService(
      'test-api-key',
      mockLogger as FastifyBaseLogger
    )
  })

  it('should successfully generate a mind map with valid input', async () => {
    const validResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              root: {
                text: 'Topic',
                children: [{ text: 'Subtopic', children: [] }]
              }
            })
          }
        }
      ]
    }
    mockCreate.mockResolvedValue(validResponse)

    const result = await openaiService.generateMindMap('Subject', 'Topic')

    // Vérification
    expect(result).toMatchObject({
      subject: 'Subject',
      topic: 'Topic',
      root: {
        text: 'Topic',
        children: expect.arrayContaining([
          expect.objectContaining({ text: 'Subtopic' })
        ])
      }
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Subject')
          })
        ])
      })
    )
  })

  // Ajout dans openai.service.test.ts
  it('should handle network errors from OpenAI API', async () => {
    // Simuler une erreur réseau
    mockCreate.mockRejectedValue(new Error('ECONNRESET'))

    // Vérifier que l'erreur est capturée et transformée
    await expect(
      openaiService.generateMindMap('Subject', 'Topic')
    ).rejects.toThrow('OpenAI API Error: Failed to generate mind map')

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error calling OpenAI API',
      expect.objectContaining({ message: 'ECONNRESET' })
    )
  })
})
