import type { ReactNode } from 'react'
import React from 'react'
import { Linking, Text } from 'react-native'

interface MarkdownLinkProps {
  href?: string
  children: ReactNode
}

export function MarkdownLink({ href, children }: MarkdownLinkProps) {
  const handlePress = async () => {
    if (!href) return
    try {
      const canOpen = await Linking.canOpenURL(href)
      if (canOpen) {
        await Linking.openURL(href)
      }
    } catch {
      return
    }
  }

  return (
    <Text className="text-primary text-base underline" onPress={handlePress}>
      {children}
    </Text>
  )
}
