import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { CirclePlus } from '@tamagui/lucide-icons'
import React, { useRef } from 'react'
import { Button } from 'tamagui'

import { FileType } from '@/types/file'

import FileSheet from '../sheets/FileSheet'

interface AddFileButtonProps {
  files: FileType[]
  setFiles: (files: FileType[]) => void
}

export const AddFileButton: React.FC<AddFileButtonProps> = ({ files, setFiles }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  const handlePress = () => {
    bottomSheetModalRef.current?.present()
  }

  return (
    <>
      <Button chromeless size={24} icon={<CirclePlus size={24} />} onPress={handlePress} />

      <FileSheet ref={bottomSheetModalRef} files={files} setFiles={setFiles} />
    </>
  )
}
