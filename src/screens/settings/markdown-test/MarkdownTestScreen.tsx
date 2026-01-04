import React from 'react'
import { ScrollView } from 'react-native'

import { Container, HeaderBar, SafeAreaContainer } from '@/componentsV2'
import { NitroMarkdown } from '@/screens/home/markdown/NitroMarkdown'

import { COMPLEX_MARKDOWN } from './testData'

export default function MarkdownTestScreen() {
  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar title="Markdown Test" showBackButton />
      <ScrollView className="flex-1">
        <Container>
          <NitroMarkdown content={COMPLEX_MARKDOWN} />
        </Container>
      </ScrollView>
    </SafeAreaContainer>
  )
}
