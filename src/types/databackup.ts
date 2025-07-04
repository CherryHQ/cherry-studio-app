import { WebSearchState } from '@/store/websearch'

import { Assistant } from './assistant'
import { Message, MessageBlock } from './message'

export type WebDavConfig = {
  webdavHost: string
  webdavUser: string
  webdavPass: string
  webdavPath: string
  fileName?: string
  skipBackupFile?: boolean
}

export type WebDAVSyncState = {
  lastSyncTime: number | null
  syncing: boolean
  lastSyncError: string | null
}

export type BackupData = {
  time: number
  version: number
  indexedDB: {
    // files: Omit<FileType, 'md5' | 'count' | 'mime_type'>[]
    topics: {
      id: string
      messages: Message[]
    }[]
    message_blocks: MessageBlock[]
  }
  localStorage: {
    'persist:cherry-studio': string
  }
}

export type BackupReduxData = {
  agents: string
  assistants: Assistant[]
  backup: {
    webdavSync: WebDAVSyncState
  }
  copilot: string
  // inputTools: string
  // knowledge: string
  llm: string
  // mcp:string
  // minapps:string
  nutstore: string
  // paintings:string
  selectionStore: string
  settings: string
  shortcuts: string
  websearch: WebSearchState
}
