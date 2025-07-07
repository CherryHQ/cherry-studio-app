import { CopilotState } from '@/store/copilot'
import { LlmState } from '@/store/llm'
import { WebSearchState } from '@/store/websearch'

import { Assistant } from './assistant'
import { Message, MessageBlock } from './message'
import { SelectionState } from './selectionTypes'
import { SettingsState } from './setting'

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

export type NutStore = {
  nutstoreToken: string
  nutstorePath: string
  nutstoreAutoSync: boolean
  nutstoreSyncInterval: number
  nutstoreSyncState: WebDAVSyncState
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
  agents: {
    agents: Assistant[]
  }
  assistants: {
    defaultAssistant: Assistant
    assistants: Assistant[]
  }
  backup: {
    webdavSync: WebDAVSyncState
  }
  nutstore: NutStore
  copilot: CopilotState
  // inputTools: string
  // knowledge: string
  llm: LlmState
  // mcp:string
  // minapps:string
  // paintings:string
  selectionStore: SelectionState
  settings: SettingsState
  // shortcuts: string
  websearch: WebSearchState
}
