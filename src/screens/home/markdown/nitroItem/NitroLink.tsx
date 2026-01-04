import type { ReactNode } from 'react'
import React from 'react'
import { Linking, Text } from 'react-native'

interface NitroLinkProps {
  href?: string
  children: ReactNode
}

export function NitroLink({ href, children }: NitroLinkProps) {
  const handlePress = () => {
    if (href) {
      Linking.openURL(href)
    }
  }

  return (
    <Text className="text-primary underline" onPress={handlePress}>
      {children}
    </Text>
  )
}
