/* eslint-disable no-var */
import { Store } from '@reduxjs/toolkit'

import { RootState } from '@/store'

declare global {
  var store: Store<RootState>
}

export {}
