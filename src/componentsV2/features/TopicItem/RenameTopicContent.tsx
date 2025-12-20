import type { FC, RefObject } from 'react'
import React, { useState } from 'react'

import TextField from '@/componentsV2/base/TextField'

interface RenameTopicContentProps {
  defaultValue: string
  nameRef: RefObject<string>
}

export const RenameTopicContent: FC<RenameTopicContentProps> = ({ defaultValue, nameRef }) => {
  const [name, setName] = useState(defaultValue)

  const handleChange = (text: string) => {
    setName(text)
    nameRef.current = text
  }

  return (
    <TextField>
      <TextField.Input
        selectionColor="#2563eb"
        className="rounded-xl"
        value={name}
        onChangeText={handleChange}
        autoFocus
      />
    </TextField>
  )
}
