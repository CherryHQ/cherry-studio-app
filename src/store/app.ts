import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

export interface AppState {
  welcomeShown: boolean
}

const initialState: AppState = {
  welcomeShown: false
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setWelcomeShown(state, action: PayloadAction<boolean>) {
      state.welcomeShown = action.payload
    }
  }
})

export const { setWelcomeShown } = appSlice.actions

export default appSlice.reducer
