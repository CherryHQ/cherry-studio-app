import React from 'react'
import { View } from 'react-native'

import { Actions } from './Actions'
import { MessageTextField } from './TextField'

interface InputRowProps {
  children?: React.ReactNode
}

export const InputRow: React.FC<InputRowProps> = ({ children }) => {
  return (
    <View className="flex-row items-center">
      {children ?? (
        <>
          <MessageTextField />
          <View className="items-end justify-end p-2">
            <Actions />
          </View>
        </>
      )}
    </View>
  )
}
