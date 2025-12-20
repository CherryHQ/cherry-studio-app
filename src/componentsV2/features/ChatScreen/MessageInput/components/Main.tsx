import React from 'react'
import { View } from 'react-native'

import XStack from '@/componentsV2/layout/XStack'

import { InputArea } from './InputArea'
import { MessageInputToolButton } from './ToolButton'

interface MainProps {
  children?: React.ReactNode
}

export const Main: React.FC<MainProps> = ({ children }) => {
  return (
    <View>
      <XStack className="items-end gap-2">
        {children ?? (
          <>
            <View className="h-[42px] items-center justify-center">
              <MessageInputToolButton />
            </View>
            <InputArea />
          </>
        )}
      </XStack>
    </View>
  )
}
