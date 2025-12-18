import { LiquidGlassView } from '@callstack/liquid-glass'
import type { Dispatch, SetStateAction } from 'react'
import React from 'react'
import { View } from 'react-native'

import { useTheme } from '@/hooks/useTheme'
import type { Assistant } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'
import { isIOS26 } from '@/utils/device'

import { EditingPreview } from '../EditingPreview'
import { FilePreview } from '../FilePreview'
import { MessageTextField } from '../MessageTextField'
import { getEnabledToolKeys, ToolPreview } from '../ToolPreview'

interface PreviewPanelProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
  isEditing: boolean
  onCancelEditing: () => void
  files: FileMetadata[]
  setFiles: Dispatch<SetStateAction<FileMetadata[]>>
  text: string
  onTextChange: (text: string) => void
  onExpand: () => void
  onPasteImages?: (uris: string[]) => void
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  assistant,
  updateAssistant,
  isEditing,
  onCancelEditing,
  files,
  setFiles,
  text,
  onTextChange,
  onExpand,
  onPasteImages
}) => {
  const { isDark } = useTheme()
  const hasToolPreview = getEnabledToolKeys(assistant).length > 0
  const hasPreviewContent = isEditing || hasToolPreview || files.length > 0

  return (
    <LiquidGlassView
      className="rounded-3xl"
      style={{
        flex: 1,
        borderRadius: 20,
        paddingVertical: hasPreviewContent ? 8 : 0,
        backgroundColor: isIOS26 ? undefined : isDark ? '#FFFFFF1A' : '#0000000D'
      }}>
      <View className="px-2">
        {isEditing && <EditingPreview onCancel={onCancelEditing} />}
        <ToolPreview assistant={assistant} updateAssistant={updateAssistant} />
        {files.length > 0 && <FilePreview files={files} setFiles={setFiles} />}
      </View>
      <MessageTextField text={text} setText={onTextChange} onExpand={onExpand} onPasteImages={onPasteImages} />
    </LiquidGlassView>
  )
}
