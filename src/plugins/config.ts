import 'dotenv/config'
import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { Static, Type } from '@sinclair/typebox'
import AjvBuilder from 'ajv'

const Ajv = AjvBuilder.default || AjvBuilder

export enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production'
}

const ConfigSchema = Type.Object({
  NODE_ENV: Type.Enum(NodeEnv),
  LOG_LEVEL: Type.String(),
  API_HOST: Type.String(),
  API_PORT: Type.String(),
  API_KEY: Type.Optional(Type.String({ minLength: 8 })),

  OPENAI_API_KEY: Type.String(),
  GCP_PROJECT_ID: Type.Optional(Type.String()),
  GCP_BUCKET_NAME: Type.Optional(Type.String()),
  GCP_KEY_FILENAME: Type.Optional(Type.String()),
  USE_LOCAL_STORAGE: Type.Optional(Type.String({ default: 'true' })),
  LOCAL_STORAGE_PATH: Type.Optional(
    Type.String({ default: './data/mindmaps', minLength: 1 })
  ),
  INPUT_CSV_PATH: Type.String({ default: './data/input_context_v2.csv' }),
  OUTPUT_CSV_PATH: Type.String({ default: '/tmp/output_results.csv' })
})

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
  allowUnionTypes: true
})

export interface Config extends Static<typeof ConfigSchema> {
  API_KEY?: string
  openai: {
    apiKey: string
  }
  storage: {
    useLocalStorage: boolean
    local: {
      storagePath: string
    }
    gcp: {
      projectId?: string
      bucketName?: string
      keyFilename?: string
    }
  }
  files: {
    inputCsvPath: string
    outputCsvPath: string
  }
}

const configPlugin: FastifyPluginAsync = async (server) => {
  const validate = ajv.compile(ConfigSchema)
  const valid = validate(process.env)
  if (!valid) {
    throw new Error(
      '.env file validation failed - ' +
        JSON.stringify(validate.errors, null, 2)
    )
  }

  const env = process.env as Static<typeof ConfigSchema>

  const useLocalStorage = env.USE_LOCAL_STORAGE?.toLowerCase() === 'true'
  if (
    useLocalStorage &&
    (!env.LOCAL_STORAGE_PATH || env.LOCAL_STORAGE_PATH.trim() === '')
  ) {
    throw new Error(
      'LOCAL_STORAGE_PATH must be defined and non-empty when USE_LOCAL_STORAGE is true'
    )
  }

  const config: Config = {
    ...env,
    openai: {
      apiKey: env.OPENAI_API_KEY
    },
    storage: {
      useLocalStorage,
      local: {
        storagePath: env.LOCAL_STORAGE_PATH || './data/mindmaps'
      },
      gcp: {
        projectId: env.GCP_PROJECT_ID,
        bucketName: env.GCP_BUCKET_NAME,
        keyFilename: env.GCP_KEY_FILENAME
      }
    },
    files: {
      inputCsvPath: env.INPUT_CSV_PATH,
      outputCsvPath: env.OUTPUT_CSV_PATH
    }
  }

  if (!config.API_KEY || config.API_KEY.length < 8) {
    server.log.warn(
      'API_KEY Not configured or too short – API security is disabled'
    )
  } else {
    server.log.info('API_KEY is configured')
  }

  server.decorate('config', config)
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
  }
}

export default fp(configPlugin)
