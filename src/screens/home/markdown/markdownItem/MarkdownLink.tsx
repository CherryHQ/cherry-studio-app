import type { ReactNode } from 'react'
import React from 'react'
import { Linking, Text } from 'react-native'

interface MarkdownLinkProps {
  href?: string
  children: ReactNode
}

export function MarkdownLink({ href, children }: MarkdownLinkProps) {
  const handlePress = () => {
    if (href) {
      Linking.openURL(href)
    }
  }

  return (
    <Text className="text-base text-primary underline" onPress={handlePress}>
      {children}
    </Text>
  )
}
