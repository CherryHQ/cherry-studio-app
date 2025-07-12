/* eslint-disable no-var */
import { Store } from '@reduxjs/toolkit'

import { RootState } from '@/store'

declare global {
  var store: Store<RootState>
}

export {}
// global.d.ts

declare namespace __WebpackModuleApi {
  interface RequireContext {
    keys(): string[];
    (id: string): any;
    resolve(id:string): string;
  }
}