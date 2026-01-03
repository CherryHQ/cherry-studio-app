import React from 'react'
import { View } from 'react-native'

import { useMessageInput } from '../context/MessageInputContext'
import { EditingPreview, FilePreview, getEnabledToolKeys, ToolPreview } from '../previews'

export const Previews: React.FC = () => {
  const { assistant, updateAssistant, isEditing, cancelEditing, files, setFiles } = useMessageInput()

  const hasToolPreview = getEnabledToolKeys(assistant).length > 0
  const hasPreviewContent = isEditing || hasToolPreview || files.length > 0

  if (!hasPreviewContent) {
    return null
  }

  return (
    <View className="px-2">
      {isEditing && <EditingPreview onCancel={cancelEditing} />}
      <ToolPreview assistant={assistant} updateAssistant={updateAssistant} />
      {files.length > 0 && <FilePreview files={files} setFiles={setFiles} />}
    </View>
  )
}
