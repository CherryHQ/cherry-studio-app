import { InputGroup } from 'heroui-native'
import React from 'react'

import { Search } from '@/componentsV2/icons'

interface SearchInputProps {
  placeholder: string
  onChangeText?: (text: string) => void
  value?: string
}

export const SearchInput = ({ placeholder, onChangeText, value }: SearchInputProps) => {
  return (
    <InputGroup className="bg-secondary rounded-xl">
      <InputGroup.Prefix>
        <Search size={20} className="text-foreground-secondary" />
      </InputGroup.Prefix>
      <InputGroup.Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        className="border-transparent bg-transparent py-1.5 focus:border-transparent"
        selectionColor="#2563eb"
        style={{
          fontSize: 16
        }}
      />
    </InputGroup>
  )
}

export default SearchInput
