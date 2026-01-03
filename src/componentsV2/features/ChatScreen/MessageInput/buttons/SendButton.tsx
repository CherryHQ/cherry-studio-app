import React from 'react'

import { IconButton } from '@/componentsV2/base/IconButton'
import { ArrowUp } from '@/componentsV2/icons'

interface SendButtonProps {
  onSend: () => void
}

export const SendButton: React.FC<SendButtonProps> = ({ onSend }) => {
  return (
    <IconButton
      icon={<ArrowUp size={22} />}
      onPress={onSend}
      style={{
        borderRadius: 99,
        padding: 3,
        backgroundColor: '#81df94'
      }}
    />
  )
}
