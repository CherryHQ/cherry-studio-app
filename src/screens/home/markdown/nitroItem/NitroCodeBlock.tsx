import { useNavigation } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import React from 'react'
import { useColorScheme, View } from 'react-native'
import CodeHighlighter from 'react-native-code-highlighter'
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs'

import { IconButton, Image, Text, XStack } from '@/componentsV2'
import { Copy, Eye } from '@/componentsV2/icons/LucideIcon'
import { useAppDispatch } from '@/store'
import { setHtmlPreviewContent } from '@/store/runtime'
import type { HomeNavigationProps } from '@/types/naviagate'
import { getCodeLanguageIcon } from '@/utils/icons/codeLanguage'

interface NitroCodeBlockProps {
  content: string
  language?: string
}

export function NitroCodeBlock({ content, language = 'text' }: NitroCodeBlockProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const lang = language || 'text'
  const navigation = useNavigation<HomeNavigationProps>()
  const dispatch = useAppDispatch()

  const isHtml = lang.toLowerCase() === 'html'

  const handleCopy = () => {
    Clipboard.setStringAsync(content)
  }

  const handlePreview = () => {
    const sizeInBytes = new Blob([content]).size
    dispatch(setHtmlPreviewContent({ content, sizeBytes: sizeInBytes }))
    navigation.navigate('HtmlPreviewScreen')
  }

  return (
    <View className="border-border mt-2 gap-2 rounded-xl border bg-zinc-100 px-3 pb-3 pt-0 shadow">
      <XStack className="border-border items-center justify-between border-b py-2">
        <XStack className="flex-1 items-center gap-2">
          {getCodeLanguageIcon(lang) && <Image source={getCodeLanguageIcon(lang)} className="h-5 w-5" />}
          <Text className="text-base">{lang.toUpperCase()}</Text>
        </XStack>
        <XStack className="gap-2">
          {isHtml && <IconButton icon={<Eye size={16} />} onPress={handlePreview} />}
          <IconButton icon={<Copy size={16} />} onPress={handleCopy} />
        </XStack>
      </XStack>
      <CodeHighlighter
        customStyle={{ backgroundColor: 'transparent' }}
        scrollViewProps={{
          contentContainerStyle: {
            backgroundColor: 'transparent'
          },
          showsHorizontalScrollIndicator: false
        }}
        textStyle={{
          fontSize: 12,
          fontFamily: 'JetbrainMono',
          userSelect: 'none'
        }}
        hljsStyle={isDark ? atomOneDark : atomOneLight}
        language={lang}
        wrapLines={true}
        wrapLongLines={true}
        lineProps={{ style: { flexWrap: 'wrap' } }}>
        {content}
      </CodeHighlighter>
    </View>
  )
}
