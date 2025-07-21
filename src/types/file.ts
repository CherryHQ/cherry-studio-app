import type { FileSchema } from '@mistralai/mistralai/models/components'

export enum FileTypes {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
  DOCUMENT = 'document',
  OTHER = 'other'
}
export interface FileType {
  id: string
  name: string
  origin_name: string
  path: string
  size: number
  ext: string
  type: FileTypes
  mime_type: string
  created_at: string
  count: number
  tokens?: number
  md5: string
}

export interface RemoteFile {
  type: 'gemini' | 'mistral'
  file: File | FileSchema
}

export type FileStatus = 'success' | 'processing' | 'failed' | 'unknown'

export interface FileUploadResponse {
  fileId: string
  displayName: string
  status: FileStatus
  originalFile?: RemoteFile
}
