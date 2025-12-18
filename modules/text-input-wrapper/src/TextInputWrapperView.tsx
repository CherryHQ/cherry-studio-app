import { requireNativeView } from 'expo'
import * as React from 'react'
import type { View } from 'react-native'

import type { PasteEventPayload, TextInputWrapperViewProps } from './TextInputWrapper.types'

const NativeTextInputWrapper = requireNativeView('TextInputWrapper')

export const TextInputWrapperView = React.forwardRef<View, TextInputWrapperViewProps>((props, ref) => {
  const { onPaste, children, ...viewProps } = props

  const handlePaste = React.useCallback(
    (event: { nativeEvent: PasteEventPayload }) => {
      if (onPaste) {
        // Expo View events wrap the payload in nativeEvent
        onPaste(event.nativeEvent)
      }
    },
    [onPaste]
  )

  return (
    <NativeTextInputWrapper ref={ref} onPaste={handlePaste} {...viewProps}>
      {children}
    </NativeTextInputWrapper>
  )
})

TextInputWrapperView.displayName = 'TextInputWrapperView'
