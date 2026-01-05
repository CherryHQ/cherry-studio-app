import structuredClone from '@ungap/structured-clone'
import { Buffer } from 'buffer'
import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'

// Polyfill btoa and atob for React Native
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = str => Buffer.from(str, 'binary').toString('base64')
}
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = b64 => Buffer.from(b64, 'base64').toString('binary')
}

// Polyfill globalThis.crypto for libraries that depend on Web Crypto API (e.g., pkce-challenge)
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: array => {
      const bytes = ExpoCrypto.getRandomBytes(array.length)
      array.set(bytes)
      return array
    },
    randomUUID: () => ExpoCrypto.randomUUID(),
    subtle: {
      digest: async (algorithm, data) => {
        // Normalize algorithm name
        const algoName = typeof algorithm === 'string' ? algorithm : algorithm.name
        const algoMap = {
          'SHA-1': ExpoCrypto.CryptoDigestAlgorithm.SHA1,
          'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
          'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
          'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512
        }
        const expoCryptoAlgo = algoMap[algoName]
        if (!expoCryptoAlgo) {
          throw new Error(`Unsupported digest algorithm: ${algoName}`)
        }

        // Convert input to Uint8Array if needed
        const uint8Data = data instanceof Uint8Array ? data : new Uint8Array(data)

        // Use expo-crypto digest and return as ArrayBuffer
        const result = await ExpoCrypto.digest(expoCryptoAlgo, uint8Data)
        return result
      }
    }
  }
}

if (typeof globalThis.TextEncoder === 'undefined') {
  class SimpleTextEncoder {
    encode(input = '') {
      const encoded = unescape(encodeURIComponent(input))
      const result = new Uint8Array(encoded.length)
      for (let i = 0; i < encoded.length; i++) {
        result[i] = encoded.charCodeAt(i)
      }
      return result
    }
  }
  globalThis.TextEncoder = SimpleTextEncoder
}

if (typeof globalThis.TextDecoder === 'undefined') {
  class SimpleTextDecoder {
    decode(input) {
      if (!input) return ''
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      return decodeURIComponent(escape(binary))
    }
  }
  globalThis.TextDecoder = SimpleTextDecoder
}

if (Platform.OS !== 'web') {
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
