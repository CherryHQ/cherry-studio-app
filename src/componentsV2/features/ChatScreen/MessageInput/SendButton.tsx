import React from 'react'

import { IconButton } from '@/componentsV2/base/IconButton'
import { ArrowUp } from '@/componentsV2/icons'

interface SendButtonProps {
  onSend: () => void
  disabled?: boolean
}

export const SendButton: React.FC<SendButtonProps> = ({ onSend, disabled = false }) => {
  return (
    <IconButton
      icon={
        <ArrowUp className={`${disabled ? 'text-text-primary dark:text-text-primary-dark' : '#ffffff'}`} size={24} />
      }
      onPress={disabled ? undefined : onSend}
      style={{
        borderRadius: 99,
        padding: 3,
        backgroundColor: disabled ? '#a0a1b099' : '#81df94'
      }}
      disabled={disabled}
    />
  )
}
