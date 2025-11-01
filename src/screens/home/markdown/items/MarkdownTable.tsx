import type { ReactNode } from 'react'
import React from 'react'
import { Dimensions, ScrollView, View } from 'react-native'

import { XStack, YStack } from '@/componentsV2'

import { markdownColors } from '../MarkdownStyles'

interface MarkdownTableProps {
  header: ReactNode[][]
  rows: ReactNode[][][]
  isDark: boolean
}

export const MarkdownTable: React.FC<MarkdownTableProps> = ({ header, rows, isDark }) => {
  const currentColors = isDark ? markdownColors.dark : markdownColors.light
  const cellWidth = Math.floor(Dimensions.get('window').width / header.length)

  const renderCell = (cellData: ReactNode, cellIndex: number) => (
    <View
      key={`${cellIndex}`}
      className="select-none p-2"
      style={{
        width: cellWidth,
        borderRightWidth: cellIndex === header.length - 1 ? 0 : 1,
        borderColor: currentColors.border
      }}>
      {cellData}
    </View>
  )

  return (
    <ScrollView horizontal={true} className="mt-2.5">
      <YStack className="rounded-3 border" style={{ borderColor: currentColors.border }}>
        <XStack
          className="rounded-t-3 border-b"
          style={{ borderColor: currentColors.border, backgroundColor: currentColors.codeBg }}>
          {header.map((cellData, cellIndex) => renderCell(cellData, cellIndex))}
        </XStack>
        {rows.map((rowData, index) => (
          <XStack
            key={`${index}`}
            className={index === rows.length - 1 ? '' : 'border-b'}
            style={{ borderColor: currentColors.border }}>
            {rowData.map((cellData, cellIndex) => renderCell(cellData, cellIndex))}
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  )
}

export default MarkdownTable
