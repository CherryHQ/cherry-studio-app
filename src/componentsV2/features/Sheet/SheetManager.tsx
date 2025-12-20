import React from 'react'

import AssistantItemSheet from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { AddModelSheet } from '@/componentsV2/features/SettingsScreen/providers/AddModelSheet'
import ExpandInputSheet from '@/componentsV2/features/Sheet/ExpandInputSheet'
import ExpandTextSheet from '@/componentsV2/features/Sheet/ExpandTextSheet'
import { McpServerSheet } from '@/componentsV2/features/Sheet/McpServerSheet'
import ModelSheet from '@/componentsV2/features/Sheet/ModelSheet'
import ProviderCheckSheet from '@/componentsV2/features/Sheet/ProviderCheckSheet'
import { ReasoningSheet } from '@/componentsV2/features/Sheet/ReasoningSheet'
import TextEditSheet from '@/componentsV2/features/Sheet/TextEditSheet'
import TextSelectionSheet from '@/componentsV2/features/Sheet/TextSelectionSheet'
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
      <TextEditSheet />
      <TextSelectionSheet />
      <ModelSheet />
      <ReasoningSheet />
      <AddModelSheet />
      <ErrorDetailSheet />
      <McpServerSheet />
      <ToolSheet />
      <WebSearchProviderSheet />
      <ImportDataSheet />
      <ExpandInputSheet />
      <ExpandTextSheet />
      <ProviderCheckSheet />
    </>
  )
}

export default SheetManager
