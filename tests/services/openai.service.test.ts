import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OpenAIService } from '../../src/services/openai.service.js'
import { ExternalAPIError } from '../../src/errors/error-types.js'
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
      } as unknown as Pick<OpenAI['chat'], 'completions'>
    }))
  }
})

describe('OpenAIService', () => {
  let openaiService: OpenAIService
  let mockLogger: Partial<FastifyBaseLogger>

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn()
    }
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
        model: 'gpt-3.5-turbo',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
          expect.objectContaining({ role: 'system' })
        ])
      }),
      expect.objectContaining({
        timeout: expect.any(Number)
      })
    )
  })

  it('should handle network errors from OpenAI API', async () => {
    const networkError = new Error('ECONNRESET')
    mockCreate.mockRejectedValue(networkError)

    await expect(
      openaiService.generateMindMap('Subject', 'Topic')
    ).rejects.toThrow(ExternalAPIError)

    await expect(
      openaiService.generateMindMap('Subject', 'Topic')
    ).rejects.toThrow(`OpenAI API Error: ${networkError.message}`)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ errorDetails: networkError }),
      'Error calling OpenAI API'
    )
  })
})
