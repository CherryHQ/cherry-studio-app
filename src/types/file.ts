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
