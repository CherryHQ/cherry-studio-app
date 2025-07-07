import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import dayjs from 'dayjs'

import { WebSearchStatus } from '@/types/websearch'

export interface WebSearchState {
  activeSearches: Record<string, WebSearchStatus>
}

export interface UpdateState {
  timestamp: number
}

export interface ExportState {
  isExporting: boolean
}

export interface RuntimeState {
  timestamp: number
  export: ExportState
  websearch: WebSearchState
}

const initialState: RuntimeState = {
  timestamp: dayjs().unix(),
  export: {
    isExporting: false
  },
  websearch: {
    activeSearches: {}
  }
}

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState,
  reducers: {
    setTimestamp: (state, action: PayloadAction<number>) => {
      state.timestamp = action.payload
    },
    setExportState: (state, action: PayloadAction<Partial<ExportState>>) => {
      state.export = { ...state.export, ...action.payload }
    },
    // WebSearch related actions
    setActiveSearches: (state, action: PayloadAction<Record<string, WebSearchStatus>>) => {
      state.websearch.activeSearches = action.payload
    },
    setWebSearchStatus: (state, action: PayloadAction<{ requestId: string; status: WebSearchStatus }>) => {
      const { requestId, status } = action.payload

      if (status.phase === 'default') {
        delete state.websearch.activeSearches[requestId]
      }

      state.websearch.activeSearches[requestId] = status
    }
  }
})

export const { setTimestamp, setWebSearchStatus, setExportState } = runtimeSlice.actions

export default runtimeSlice.reducer
