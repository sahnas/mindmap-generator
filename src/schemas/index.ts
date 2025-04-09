import { Type } from '@sinclair/typebox'

export const MindMapNodeSchema = Type.Recursive((Self) =>
  Type.Object({
    id: Type.String(),
    text: Type.String(),
    children: Type.Optional(Type.Array(Self))
  })
)

export const MindMapSchema = Type.Object({
  id: Type.String(),
  subject: Type.String(),
  topic: Type.String(),
  root: MindMapNodeSchema,
  createdAt: Type.String()
})

export const MindMapsResponseSchema = Type.Object({
  mindMaps: Type.Array(MindMapSchema)
})

export const GenerationRequestSchema = Type.Object({
  inputCsvPath: Type.Optional(Type.String()),
  outputCsvPath: Type.Optional(Type.String())
})

export const GenerationResponseSchema = Type.Object({
  results: Type.Array(
    Type.Object({
      topic: Type.String(),
      status: Type.Union([Type.Literal('Success'), Type.Literal('Failure')]),
      error: Type.Optional(Type.String())
    })
  )
})

export const RootResponseSchema = Type.Object({
  status: Type.String(),
  message: Type.String()
})
