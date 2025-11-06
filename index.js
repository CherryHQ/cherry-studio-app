import 'react-native-gesture-handler'
import 'react-native-quick-base64'
import './polyfills'

import { Buffer } from 'buffer'
import { registerRootComponent } from 'expo'
import { fetch } from 'expo/fetch'

import App from './src/App'

globalThis.Buffer = Buffer
globalThis.fetch = fetch

if (typeof global.DOMException === 'undefined') {
  // @ts-ignore
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message)
      this.name = name
    }
  }
}

registerRootComponent(App)
