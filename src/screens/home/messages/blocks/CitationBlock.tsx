import React from 'react'
import { View } from 'react-native'

import type { CitationMessageBlock } from '@/types/message'
import { formatCitationsFromBlock } from '@/utils/formats'

import CitationsList from '../CitationList'

function CitationBlock({ block }: { block: CitationMessageBlock }) {
  const formattedCitations = formatCitationsFromBlock(block)
  return (
    <View>
      <CitationsList citations={formattedCitations} />
    </View>
  )
}

export default CitationBlock
