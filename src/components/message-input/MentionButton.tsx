import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { AtSign } from '@tamagui/lucide-icons'
import React, { useRef } from 'react'
import { Button } from 'tamagui'

import { Model } from '@/types/assistant'

import MentionSheet from '../sheets/MentionSheet'

interface MentionButtonProps {
  mentions: Model[]
  setMentions: (mentions: Model[]) => void
}

export const MentionButton: React.FC<MentionButtonProps> = ({ mentions, setMentions }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const handlePress = () => {
    bottomSheetModalRef.current?.present()
  }

  return (
    <>
      <Button
        chromeless
        size={24}
        icon={<AtSign size={24} />}
        color={mentions.length > 0 ? 'rgba(0, 185, 107, 1)' : undefined}
        onPress={handlePress}
      />

      <MentionSheet ref={bottomSheetModalRef} mentions={mentions} setMentions={setMentions} />
    </>
  )
}
