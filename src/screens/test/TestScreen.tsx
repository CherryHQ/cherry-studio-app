import React from 'react'
import { ScrollView, Stack, useTheme } from 'tamagui'

import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { MainTextMessageBlock } from '@/types/message'

import { getBlockById } from '../../../db/queries/messageBlocks.queries'
import ReactNativeMarkdown from '../home/markdown/ReactNativeMarkdown'

const TestScreen = () => {
  const theme = useTheme()

  const renderReactNativeMarkdownDisplay = async () => {
    const block = await getBlockById('a260bc37-6d00-43d1-ad33-e0d36a71ba0a')
    if (block === null) return
    return <ReactNativeMarkdown block={block as MainTextMessageBlock} />
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScrollView>
        <Stack padding="$4" margin="$4">
          {renderReactNativeMarkdownDisplay()}
        </Stack>
      </ScrollView>
    </SafeAreaContainer>
  )
}

export default TestScreen
