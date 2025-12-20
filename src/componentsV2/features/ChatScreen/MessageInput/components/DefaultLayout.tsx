import React from 'react'

import YStack from '@/componentsV2/layout/YStack'

import { AccessoryBar } from './AccessoryBar'
import { Main } from './Main'

export const DefaultLayout: React.FC = () => {
  return (
    <YStack className="gap-2.5">
      <Main />
      <AccessoryBar />
    </YStack>
  )
}
