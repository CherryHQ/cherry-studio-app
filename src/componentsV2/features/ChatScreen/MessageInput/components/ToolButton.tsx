import React from 'react'

import { ToolButton } from '../buttons'
import { useMessageInput } from '../context/MessageInputContext'

/**
 * Context-aware ToolButton wrapper for use within MessageInput
 * Gets props from MessageInputContext and passes them to the base ToolButton
 */
export const MessageInputToolButton: React.FC = () => {
  const { mentions, files, setFiles, assistant, updateAssistant } = useMessageInput()

  return (
    <ToolButton
      mentions={mentions}
      files={files}
      setFiles={setFiles}
      assistant={assistant}
      updateAssistant={updateAssistant}
    />
  )
}
