import React from 'react'
import { ScrollView } from 'react-native'

import { Container, HeaderBar, SafeAreaContainer } from '@/componentsV2'
import { MarkdownRenderer } from '@/screens/home/markdown/MarkdownRenderer'

import { COMPLEX_MARKDOWN } from './testData'

export default function MarkdownTestScreen() {
  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title="Markdown Test" showBackButton />
      <ScrollView className="flex-1">
        <Container>
          <MarkdownRenderer content={COMPLEX_MARKDOWN} />
        </Container>
      </ScrollView>
    </SafeAreaContainer>
  )
}
