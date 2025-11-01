import React from 'react'
import { ViewStyle, TextStyle, View } from 'react-native'
import CodeHighlighter from 'react-native-code-highlighter'
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import { useNavigation } from '@react-navigation/native'

import { IconButton, Image, Text, XStack } from '@/componentsV2'
import { Copy, Eye } from '@/componentsV2/icons/LucideIcon'
import { getCodeLanguageIcon } from '@/utils/icons/codeLanguage'
import { markdownColors } from '../MarkdownStyles'
import { HomeNavigationProps } from '@/types/naviagate'
import { useAppDispatch } from '@/store'
import { setHtmlPreviewContent } from '@/store/runtime'

interface MarkdownCodeProps {
  text: string
  language?: string
  isDark: boolean
  onCopy: (content: string) => void
  containerStyle?: ViewStyle
  textStyle?: TextStyle
}

export const MarkdownCode: React.FC<MarkdownCodeProps> = ({
  text,
  language = 'text',
  isDark,
  onCopy,
  containerStyle,
  textStyle
}) => {
  const currentColors = isDark ? markdownColors.dark : markdownColors.light
  const lang = language || 'text'
  const navigation = useNavigation<HomeNavigationProps>()
  const dispatch = useAppDispatch()

  const handlePreview = () => {
    const sizeInBytes = new Blob([text]).size

    dispatch(setHtmlPreviewContent({ content: text, sizeBytes: sizeInBytes }))
    navigation.navigate('HtmlPreviewScreen')
  }

  const isHtml = lang.toLowerCase() === 'html'

  return (
    <View className="rounded-3 mt-2 gap-2 px-3 pb-3 pt-0" style={containerStyle}>
      <XStack className="items-center justify-between border-b py-2" style={{ borderColor: currentColors.codeBorder }}>
        <XStack className="flex-1 items-center gap-2">
          {getCodeLanguageIcon(lang) && <Image source={getCodeLanguageIcon(lang)} className="h-5 w-5" />}
          <Text className="text-base">{lang.toUpperCase()}</Text>
        </XStack>
        <XStack className="gap-2">
          {isHtml && <IconButton icon={<Eye size={16} color="$gray60" />} onPress={handlePreview} />}
          <IconButton icon={<Copy size={16} color="$gray60" />} onPress={() => onCopy(text)} />
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
          ...textStyle,
          fontSize: 12,
          fontFamily: 'JetbrainMono',
          userSelect: 'none'
        }}
        hljsStyle={isDark ? atomOneDark : atomOneLight}
        language={lang}
        wrapLines={true}
        wrapLongLines={true}
        lineProps={{ style: { flexWrap: 'wrap' } }}>
        {text}
      </CodeHighlighter>
    </View>
  )
}

export default MarkdownCode
