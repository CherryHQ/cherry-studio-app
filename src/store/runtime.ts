import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

import type { Message } from '@/types/message'

export interface RuntimeState {
  htmlPreviewContent: string | null
  htmlPreviewSizeBytes: number
  editingMessage: Message | null
}

const initialState: RuntimeState = {
  htmlPreviewContent: null,
  htmlPreviewSizeBytes: 0,
  editingMessage: null
}

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState,
  reducers: {
    setHtmlPreviewContent(state, action: PayloadAction<{ content: string | null; sizeBytes: number }>) {
      state.htmlPreviewContent = action.payload.content
      state.htmlPreviewSizeBytes = action.payload.sizeBytes
    },
    setEditingMessage(state, action: PayloadAction<Message | null>) {
      state.editingMessage = action.payload
    }
  }
})

export const { setHtmlPreviewContent, setEditingMessage } = runtimeSlice.actions

export default runtimeSlice.reducer
