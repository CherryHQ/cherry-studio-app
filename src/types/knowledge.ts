import type { Model } from './assistant'
import type { FileMetadata } from './file'

export type KnowledgeReference = {
  id: number
  content: string
  sourceUrl: string
  type: KnowledgeItemType
  file?: FileMetadata
}

export type KnowledgeItemType = 'file' | 'url' | 'note' | 'sitemap' | 'directory'

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type KnowledgeItem = {
  id: string
  baseId?: string
  uniqueId?: string
  uniqueIds?: string[]
  type: KnowledgeItemType
  content: string | FileMetadata
  remark?: string
  created_at: number
  updated_at: number
  processingStatus?: ProcessingStatus
  processingProgress?: number
  processingError?: string
  retryCount?: number
}

export interface KnowledgeBase {
  id: string
  name: string
  model: Model
  dimensions: number
  description?: string
  items: KnowledgeItem[]
  created_at: number
  updated_at: number
  version: number
  documentCount?: number
  chunkSize?: number
  chunkOverlap?: number
  threshold?: number
  rerankModel?: Model
  // topN?: number
}

export type KnowledgeBaseParams = {
  id: string
  model: string
  provider: string
  dimensions?: number
  apiKey: string
  apiVersion?: string
  baseURL: string
  chunkSize?: number
  chunkOverlap?: number
  rerankApiKey?: string
  rerankBaseURL?: string
  rerankModel?: string
  rerankModelProvider?: string
  documentCount?: number
}
