import React from 'react'

import AssistantItemSheet from '@/componentsV2/features/Assistant/AssistantItemSheet'
import { AddModelSheet } from '@/componentsV2/features/SettingsScreen/AddModelSheet'
import TextSelectionSheet from '@/componentsV2/features/Sheet/TextSelectionSheet'
import { ErrorDetailSheet } from '@/screens/home/messages/blocks/ErrorBlock'

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
      <TextSelectionSheet />
      <AddModelSheet />
      <ErrorDetailSheet />
    </>
  )
}

export default SheetManager
