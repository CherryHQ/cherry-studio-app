import structuredClone from '@ungap/structured-clone'
import { Platform } from 'react-native'
import crypto from 'react-native-quick-crypto'

// Polyfill crypto module for Node.js style require('crypto')
if (Platform.OS !== 'web') {
  // Set up crypto polyfill synchronously
  global.crypto = crypto

  const setupPolyfills = async () => {
    const { polyfillGlobal } = await import('react-native/Libraries/Utilities/PolyfillFunctions')

    const { TextEncoderStream, TextDecoderStream } = await import('@stardazed/streams-text-encoding')

    if (!('structuredClone' in global)) {
      polyfillGlobal('structuredClone', () => structuredClone)
    }

    polyfillGlobal('TextEncoderStream', () => TextEncoderStream)
    polyfillGlobal('TextDecoderStream', () => TextDecoderStream)
  }

  setupPolyfills()
}

export {}
