import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

export interface RuntimeState {
  htmlPreviewContent: string | null
  htmlPreviewSizeBytes: number
}

const initialState: RuntimeState = {
  htmlPreviewContent: null,
  htmlPreviewSizeBytes: 0
}

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState,
  reducers: {
    setHtmlPreviewContent(state, action: PayloadAction<{ content: string | null; sizeBytes: number }>) {
      state.htmlPreviewContent = action.payload.content
      state.htmlPreviewSizeBytes = action.payload.sizeBytes
    }
  }
})

export const { setHtmlPreviewContent } = runtimeSlice.actions

export default runtimeSlice.reducer
