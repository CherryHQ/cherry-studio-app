import { BaseMessageBlock, Message } from './message'

export type WebDavConfig = {
  webdavHost: string
  webdavUser: string
  webdavPass: string
  webdavPath: string
  fileName?: string
  skipBackupFile?: boolean
}

export type BackupData = {
  time: number
  version: number
  indexedDB: {
    // files: Omit<FileType, 'md5' | 'count' | 'mime_type'>[]
    topics: {
      id: string
      messages: Message[]
    }
    message_blocks: BaseMessageBlock[]
  }
  localStorage: {
    'persist:cherry-studio': string
  }
}

export type BackupReduxData = {
  agents: string
  assistants: string
  backup: string
  copilot: string
  inputTools: string
  knowledge: string
  llm: string
  // mcp:string
  // minapps:string
  nutstore: string
  // paintings:string
  selectionStore: string
  settings: string
  shortcuts: string
  websearch: string
}
