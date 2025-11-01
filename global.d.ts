import type { Store } from '@reduxjs/toolkit'

import type { RootState } from '@/store'

declare global {
  var store: Store<RootState>
}

export {}
