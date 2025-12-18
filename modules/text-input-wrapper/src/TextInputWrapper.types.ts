import type { ReactNode } from 'react'
import type { ViewProps } from 'react-native'

export type PasteEventPayload =
  | { type: 'text'; value: string }
  | { type: 'images'; uris: string[] }
  | { type: 'unsupported' }

export interface TextInputWrapperViewProps extends ViewProps {
  /**
   * Callback fired when a paste event is detected.
   * @param payload - The paste event payload containing type and content
   */
  onPaste?: (payload: PasteEventPayload) => void

  /**
   * Child components to wrap. Typically a TextInput component.
   */
  children?: ReactNode
}
