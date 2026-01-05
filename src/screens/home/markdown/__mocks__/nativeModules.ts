/* global jest */
import type React from 'react'
import type { MarkdownNode } from 'react-native-nitro-markdown'

// react-native-nitro-markdown mock
jest.mock('react-native-nitro-markdown', () => ({
  parseMarkdownWithOptions: jest.fn((content: string) => {
    // Return a simple document node for testing
    return {
      type: 'document',
      children: [{ type: 'paragraph', children: [{ type: 'text', content }] }]
    } as MarkdownNode
  })
}))

// react-native-code-highlighter mock
jest.mock('react-native-code-highlighter', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children, language }: { children: string; language?: string }) =>
      React.createElement(
        View,
        { testID: 'code-highlighter' },
        React.createElement(Text, { testID: 'code-content', 'data-language': language }, children)
      )
  }
})

// react-syntax-highlighter mock
jest.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({
  atomOneDark: { background: '#282c34' },
  atomOneLight: { background: '#fafafa' }
}))

// react-native-mathjax-svg mock
jest.mock('react-native-mathjax-svg', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    __esModule: true,
    default: ({ children, fontSize }: { children: string; fontSize?: number }) =>
      React.createElement(Text, { testID: 'mathjax', 'data-fontsize': fontSize }, children)
  }
})

// expo-clipboard mock
const mockSetStringAsync = jest.fn().mockResolvedValue(true)
jest.mock('expo-clipboard', () => ({
  setStringAsync: mockSetStringAsync,
  getStringAsync: jest.fn().mockResolvedValue(''),
  hasStringAsync: jest.fn().mockResolvedValue(false)
}))

// react-i18next mock
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

// useToast mock
const mockToastShow = jest.fn()
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ show: mockToastShow })
}))

// React Navigation mock
const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack
  })
}))

// Redux mock
const mockDispatch = jest.fn()
jest.mock('@/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: jest.fn()
}))

jest.mock('@/store/runtime', () => ({
  setHtmlPreviewContent: jest.fn((payload: { content: string; sizeBytes: number }) => ({
    type: 'runtime/setHtmlPreviewContent',
    payload
  }))
}))

// uniwind mock for styled components
jest.mock('uniwind', () => ({
  withUniwind: (Component: React.ComponentType) => Component
}))

// Icon components mock
jest.mock('@/componentsV2/icons/LucideIcon', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Copy: (props: { size?: number }) => React.createElement(View, { testID: 'icon-copy', ...props }),
    Eye: (props: { size?: number }) => React.createElement(View, { testID: 'icon-eye', ...props }),
    Square: (props: { size?: number }) => React.createElement(View, { testID: 'icon-square', ...props }),
    SquareCheck: (props: { size?: number }) => React.createElement(View, { testID: 'icon-square-check', ...props }),
    ImageOff: (props: { size?: number }) => React.createElement(View, { testID: 'icon-image-off', ...props })
  }
})

// componentsV2 mock
jest.mock('@/componentsV2', () => {
  const React = require('react')
  const { View, Text, Pressable, Image: RNImage } = require('react-native')
  return {
    ContextMenu: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    IconButton: ({ icon, onPress, testID }: { icon: React.ReactNode; onPress: () => void; testID?: string }) =>
      React.createElement(Pressable, { onPress, testID: testID || 'icon-button' }, icon),
    Image: (props: React.ComponentProps<typeof RNImage>) => React.createElement(RNImage, { testID: 'image', ...props }),
    XStack: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: 'xstack', style: { flexDirection: 'row' } }, children),
    Text: (props: React.ComponentProps<typeof Text>) => React.createElement(Text, { testID: 'custom-text', ...props }),
    ImageGalleryViewer: ({
      visible,
      onClose
    }: {
      images: string[]
      initialIndex: number
      visible: boolean
      onClose: () => void
    }) => (visible ? React.createElement(View, { testID: 'image-gallery', onTouchEnd: onClose }) : null)
  }
})

// Code language icon mock
jest.mock('@/utils/icons/codeLanguage', () => ({
  getCodeLanguageIcon: jest.fn((lang: string) => (lang === 'javascript' || lang === 'js' ? 'js-icon' : null))
}))

// Export mocks for assertions
export { mockDispatch, mockGoBack, mockNavigate, mockSetStringAsync, mockToastShow }
