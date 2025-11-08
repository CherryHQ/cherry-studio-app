import React from 'react'

import { Search } from '@/componentsV2/icons'

import TextField from '../TextField'

interface SearchInputProps {
  placeholder: string
  onChangeText?: (text: string) => void
  value?: string
}

export const SearchInput = ({ placeholder, onChangeText, value }: SearchInputProps) => {
  return (
    <TextField>
      <TextField.Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        className="h-10 w-full rounded-xl bg-transparent px-2 py-0 text-base">
        <TextField.InputStartContent>
          <Search size={20} className="text-text-secondary" />
        </TextField.InputStartContent>
      </TextField.Input>
    </TextField>
  )
}

export default SearchInput
