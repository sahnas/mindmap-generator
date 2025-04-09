import { MindMap } from '../types/index.js'

export interface IMindMapGenerator {
  generateMindMap(subject: string, topic: string): Promise<MindMap>
}
