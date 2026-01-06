import React from 'react'

import AssistantItemSheet from '@/componentsV2/features/Assistant/AssistantItemSheet'
import McpServerItemSheet from '@/componentsV2/features/MCP/McpServerItemSheet'
import { AddModelSheet } from '@/componentsV2/features/SettingsScreen/providers/AddModelSheet'
import ExpandInputSheet from '@/componentsV2/features/Sheet/ExpandInputSheet'
import { HeadersEditSheet } from '@/componentsV2/features/Sheet/HeadersEditSheet'
import { McpDescriptionSheet } from '@/componentsV2/features/Sheet/McpDescriptionSheet'
import { McpServerSheet } from '@/componentsV2/features/Sheet/McpServerSheet'
import { McpToolSheet } from '@/componentsV2/features/Sheet/McpToolSheet'
import ModelSheet from '@/componentsV2/features/Sheet/ModelSheet'
import PromptDetailSheet from '@/componentsV2/features/Sheet/PromptDetailSheet'
import ProviderCheckSheet from '@/componentsV2/features/Sheet/ProviderCheckSheet'
import { ReasoningSheet } from '@/componentsV2/features/Sheet/ReasoningSheet'
import TextEditSheet from '@/componentsV2/features/Sheet/TextEditSheet'
import { ThinkingDetailSheet } from '@/componentsV2/features/Sheet/ThinkingDetailSheet'
import { ToolCallDetailSheet } from '@/componentsV2/features/Sheet/ToolCallDetailSheet'
import { ToolSheet } from '@/componentsV2/features/Sheet/ToolSheet'
import { WebSearchProviderSheet } from '@/componentsV2/features/Sheet/WebSearchProviderSheet'
import { ErrorDetailSheet } from '@/screens/home/messages/blocks/ErrorBlock'
import { ImportDataSheet } from '@/screens/welcome/ImportDataSheet'

/**
 * SheetManager - 统一管理所有全局 TrueSheet 实例
 *
 * 注意：TrueSheet 使用 name 作为全局唯一标识符，
 * 因此每个 Sheet 只能有一个实例，需要在 App 根级别注册。
 *
 * 使用方式：
 * 1. 在此处注册 Sheet 组件
 * 2. 在需要的地方调用 present*Sheet() 方法
 */
const SheetManager: React.FC = () => {
  return (
    <>
      <AssistantItemSheet />
      <McpServerItemSheet />
      <TextEditSheet />
      <ModelSheet />
      <ReasoningSheet />
      <AddModelSheet />
      <ErrorDetailSheet />
      <McpServerSheet />
      <ToolSheet />
      <WebSearchProviderSheet />
      <ImportDataSheet />
      <ExpandInputSheet />
      <PromptDetailSheet />
      <ProviderCheckSheet />
      <HeadersEditSheet />
      <McpDescriptionSheet />
      <McpToolSheet />
      <ToolCallDetailSheet />
      <ThinkingDetailSheet />
    </>
  )
}

export default SheetManager
