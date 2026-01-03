import { SkeletonGroup } from 'heroui-native'
import React from 'react'
import { View } from 'react-native'

interface GridSkeletonProps {
  count?: number
}

export const GridSkeleton = ({ count = 6 }: GridSkeletonProps) => {
  return (
    <View className="flex-row flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => i + 1).map(item => (
        <SkeletonGroup
          key={item}
          isLoading
          isSkeletonOnly
          variant="shimmer"
          className="bg-card w-[48%] items-center gap-2 rounded-2xl px-3.5 py-4"
          style={{ height: 230 }}>
          <SkeletonGroup.Item className="size-[90px] rounded-full" />
          <SkeletonGroup.Item className="h-4 w-3/5 rounded-md" />
          <View className="w-full items-center gap-1">
            <SkeletonGroup.Item className="h-3 w-4/5 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-3/5 rounded-md" />
          </View>
          <View className="flex-row gap-2">
            <SkeletonGroup.Item className="h-[18px] w-10 rounded-lg" />
            <SkeletonGroup.Item className="h-[18px] w-12 rounded-lg" />
          </View>
        </SkeletonGroup>
      ))}
    </View>
  )
}
