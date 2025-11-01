import { useTheme } from 'heroui-native'
import type { FC } from 'react'
import React from 'react'
import ContentLoader, { Rect } from 'react-content-loader/native'
import { View } from 'react-native'

const AssistantItemSkeleton: FC = () => {
  const { isDark } = useTheme()
  return (
    <View className="rounded-2xl bg-ui-card-background px-2.5 py-2.5 dark:bg-ui-card-background-dark">
      <ContentLoader
        height={46}
        width={300}
        speed={1}
        backgroundColor={isDark ? '#333333' : '#eeeeee'}
        foregroundColor={isDark ? '#555555' : '#cccccc'}
        viewBox="0 0 300 46">
        <Rect x="0" y="0" rx="18" ry="18" width="46" height="46" />

        <Rect x="60" y="8" rx="4" ry="4" width="120" height="14" />

        <Rect x="60" y="26" rx="3" ry="3" width="180" height="12" />
      </ContentLoader>
    </View>
  )
}

export default AssistantItemSkeleton
