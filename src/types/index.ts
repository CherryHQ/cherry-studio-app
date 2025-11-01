import type { WebSearchResponse } from '@/types/websearch'

import type { KnowledgeReference } from './knowledge'
import type { MCPToolResponse } from './mcp'
import type { MCPTool } from './tool'

export type LanguageVarious = 'zh-Hans-CN' | 'zh-Hans-TW' | 'en-US' | 'ru-RU' | 'ja-JP'
// | 'ko-KR'
// | 'es-ES'
// | 'de-DE'
// | 'fr-FR'
// | 'id-ID'
export enum ThemeMode {
  light = 'light',
  dark = 'dark',
  system = 'system'
}

export type ExternalToolResult = {
  mcpTools?: MCPTool[]
  toolUse?: MCPToolResponse[]
  webSearch?: WebSearchResponse
  knowledge?: KnowledgeReference[]
}
