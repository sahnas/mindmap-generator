import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import configPlugin from '../src/plugins/config.js'

const originalEnv = { ...process.env }

describe('Config Plugin', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }

    process.env.NODE_ENV = 'development'
    process.env.LOG_LEVEL = 'info'
    process.env.API_HOST = 'localhost'
    process.env.API_PORT = '3000'
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.INPUT_CSV_PATH = './data/input.csv'
    process.env.OUTPUT_CSV_PATH = './data/output.csv'

    app = Fastify()
  })

  afterEach(async () => {
    await app.close()

    process.env = originalEnv
  })

  it('should load valid config successfully', async () => {
    await app.register(configPlugin)

    expect(app.config).toBeDefined()
    expect(app.config.NODE_ENV).toBe('development')
    expect(app.config.LOG_LEVEL).toBe('info')
    expect(app.config.API_HOST).toBe('localhost')
    expect(app.config.API_PORT).toBe('3000')
    expect(app.config.openai.apiKey).toBe('test-key')
    expect(app.config.files.inputCsvPath).toBe('./data/input.csv')
    expect(app.config.files.outputCsvPath).toBe('./data/output.csv')

    expect(app.config.storage.useLocalStorage).toBe(true)
    expect(app.config.storage.local.storagePath).toBe('./data/mindmaps')
  })

  it('should configure GCP storage correctly', async () => {
    process.env.USE_LOCAL_STORAGE = 'false'
    process.env.GCP_PROJECT_ID = 'test-project'
    process.env.GCP_BUCKET_NAME = 'test-bucket'
    process.env.GCP_KEY_FILENAME = './gcp-key.json'

    await app.register(configPlugin)

    expect(app.config.storage.useLocalStorage).toBe(false)
    expect(app.config.storage.gcp.projectId).toBe('test-project')
    expect(app.config.storage.gcp.bucketName).toBe('test-bucket')
    expect(app.config.storage.gcp.keyFilename).toBe('./gcp-key.json')
  })

  it('should throw error when required env vars are missing', async () => {
    delete process.env.API_PORT

    await expect(app.register(configPlugin)).rejects.toThrow(
      /validation failed/
    )
  })

  it('should throw error when LOCAL_STORAGE_PATH is empty and using local storage', async () => {
    process.env.USE_LOCAL_STORAGE = 'true'
    process.env.LOCAL_STORAGE_PATH = ''

    await expect(app.register(configPlugin)).rejects.toThrow(
      /LOCAL_STORAGE_PATH/
    )
  })

  it('should validate and coerce environment variable types', async () => {
    process.env.USE_LOCAL_STORAGE = 'True'

    await app.register(configPlugin)

    expect(app.config.storage.useLocalStorage).toBe(true)
  })
})
