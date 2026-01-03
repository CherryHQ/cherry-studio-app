import React from 'react'

import { IconButton } from '@/componentsV2/base/IconButton'
import { CirclePause } from '@/componentsV2/icons'

interface PauseButtonProps {
  onPause: () => void
}

export const PauseButton: React.FC<PauseButtonProps> = ({ onPause }) => {
  return (
    <IconButton
      style={{ alignItems: 'center', justifyContent: 'center' }}
      icon={<CirclePause size={28} className="text-red-600" />}
      onPress={onPause}
    />
  )
}
