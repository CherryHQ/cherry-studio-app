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
    <TextField className="bg-secondary rounded-xl">
      <TextField.Input
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        className="h-10 w-full"
        selectionColor="#2563eb"
        animation={{
          backgroundColor: {
            value: {
              blur: 'transparent',
              focus: 'transparent',
              error: 'transparent'
            }
          },
          borderColor: {
            value: {
              blur: 'transparent',
              focus: 'transparent',
              error: 'transparent'
            }
          }
        }}
        style={{
          fontSize: 18
        }}>
        <TextField.InputStartContent>
          <Search size={20} className="text-foreground-secondary" />
        </TextField.InputStartContent>
      </TextField.Input>
    </TextField>
  )
}

export default SearchInput
