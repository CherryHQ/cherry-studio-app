import type { WebSearchProvider, WebSearchState } from '@/types/websearch'

import type { Assistant, Provider, Topic } from './assistant'
import type { Message, MessageBlock } from './message'

export type BackupData = {
  time: number
  version: number
  indexedDB: ImportIndexedData
  redux: ImportReduxData
}

export type ImportIndexedData = {
  topics: {
    id: string
    messages: Message[]
  }[]
  message_blocks: MessageBlock[]
  settings: Setting[]
}

export type Setting = {
  id: string
  value: string
}

export type ImportReduxData = {
  assistants: {
    defaultAssistant: Assistant
    assistants: Assistant[]
  }
  llm: {
    providers: Provider[]
  }
  websearch: WebSearchState & { providers: WebSearchProvider[] }
  settings: {
    userName: string
  }
}

export type ExportIndexedData = {
  topics: Topic[]
  message_blocks: MessageBlock[]
  messages: Message[]
  settings: Setting[]
}

export type ExportReduxData = ImportReduxData
