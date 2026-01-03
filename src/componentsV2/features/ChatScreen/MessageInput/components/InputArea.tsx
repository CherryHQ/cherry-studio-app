import { LiquidGlassView } from '@callstack/liquid-glass'
import React from 'react'

import { useTheme } from '@/hooks/useTheme'
import { isIOS26 } from '@/utils/device'

import { useMessageInput } from '../context/MessageInputContext'
import { getEnabledToolKeys } from '../previews'
import { InputRow } from './InputRow'
import { Previews } from './Previews'

interface InputAreaProps {
  children?: React.ReactNode
}

export const InputArea: React.FC<InputAreaProps> = ({ children }) => {
  const { isDark } = useTheme()
  const { assistant, isEditing, files } = useMessageInput()

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
      {children ?? (
        <>
          <Previews />
          <InputRow />
        </>
      )}
    </LiquidGlassView>
  )
}
