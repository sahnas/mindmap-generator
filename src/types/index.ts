export interface RawMindMapNode {
  text: string
  children?: RawMindMapNode[]
}

export interface RawMindMapData {
  root: RawMindMapNode
}

export interface MindMapNode {
  id: string
  text: string
  children?: MindMapNode[]
}

export interface MindMap {
  id: string
  subject: string
  topic: string
  root: MindMapNode
  createdAt: string
}

export interface PaginatedResponse {
  mindMaps: MindMap[]
  nextPageToken?: string
  total?: number
}

export interface IStorageService {
  initBucket(): Promise<void>
  storeMindMap(mindMap: MindMap): Promise<string>
  getAllMindMaps(pageToken?: string, limit?: number): Promise<PaginatedResponse>
}

export interface RetryOptions {
  retries: number
  onFailedAttempt: (error: {
    attemptNumber: number
    retriesLeft: number
    message: string
  }) => void
  factor: number
  minTimeout: number
  maxTimeout: number
}

export type Status = 'Success' | 'Failure'

export interface ProcessingResult {
  topic: string
  status: Status
  error?: string
}

export interface CSVInputRow {
  subject: string
  topic: string
}

export interface CSVOutputRow {
  topic: string
  status: string
}
