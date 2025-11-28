import type { SheetDefinition } from 'react-native-actions-sheet'
import { registerSheet } from 'react-native-actions-sheet'

import type { Model } from '@/types/assistant'

import ModelSheet from '../features/Sheet/ModelSheet'

registerSheet('model-sheet', ModelSheet)

declare module 'react-native-actions-sheet' {
  interface Sheets {
    'model-sheet': SheetDefinition<{
      payload: {
        mentions: Model[]
        setMentions: (mentions: Model[], isMultiSelectActive?: boolean) => Promise<void>
        multiple?: boolean
      }
    }>
  }
}

export {}
