import { SkeletonGroup } from 'heroui-native'
import React from 'react'
import { View } from 'react-native'

interface ListSkeletonProps {
  variant?: 'default' | 'card' | 'mcp' | 'provider' | 'model'
  count?: number
}

export const ListSkeleton = ({ variant = 'default', count = 3 }: ListSkeletonProps) => {
  if (variant === 'model') {
    return (
      <View className="w-full gap-3">
        {Array.from({ length: count }, (_, i) => i + 1).map(item => (
          <SkeletonGroup
            key={item}
            isLoading
            isSkeletonOnly
            variant="shimmer"
            className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2">
              <SkeletonGroup.Item className="size-8 rounded-md" />
              <View className="flex-1 gap-1">
                <SkeletonGroup.Item className="h-4 w-2/3 rounded-md" />
                <View className="flex-row gap-1">
                  <SkeletonGroup.Item className="h-3 w-10 rounded-md" />
                  <SkeletonGroup.Item className="h-3 w-8 rounded-md" />
                </View>
              </View>
            </View>
            <SkeletonGroup.Item className="size-5 rounded-full" />
          </SkeletonGroup>
        ))}
      </View>
    )
  }

  if (variant === 'provider') {
    return (
      <View className="w-full gap-0">
        {Array.from({ length: count }, (_, i) => i + 1).map(item => (
          <SkeletonGroup
            key={item}
            isLoading
            isSkeletonOnly
            variant="shimmer"
            className="flex-row items-center justify-between px-4 py-3">
            <View className="flex-row items-center gap-2">
              <SkeletonGroup.Item className="size-6 rounded-md" />
              <SkeletonGroup.Item className="h-5 w-24 rounded-md" />
            </View>
            <View className="flex-row items-center gap-2.5">
              <SkeletonGroup.Item className="h-5 w-14 rounded-lg" />
              <SkeletonGroup.Item className="size-4 rounded-sm" />
            </View>
          </SkeletonGroup>
        ))}
      </View>
    )
  }

  if (variant === 'mcp') {
    return (
      <View className="w-full gap-2">
        {Array.from({ length: count }, (_, i) => i + 1).map(item => (
          <SkeletonGroup
            key={item}
            isLoading
            isSkeletonOnly
            variant="shimmer"
            className="bg-card flex-row items-center justify-between rounded-2xl px-2.5 py-2.5">
            <View className="flex-1 gap-2">
              <SkeletonGroup.Item className="h-5 w-1/3 rounded-md" />
              <SkeletonGroup.Item className="h-4 w-2/3 rounded-md" />
            </View>
            <View className="items-end gap-2">
              <SkeletonGroup.Item className="h-6 w-12 rounded-full" />
              <SkeletonGroup.Item className="h-5 w-16 rounded-lg" />
            </View>
          </SkeletonGroup>
        ))}
      </View>
    )
  }

  const isCard = variant === 'card'
  const avatarSize = isCard ? 'size-[46px]' : 'size-[42px]'
  const avatarRadius = isCard ? 'rounded-[18px]' : 'rounded-xl'

  return (
    <View className={isCard ? 'w-full gap-2 px-4' : 'w-full gap-3 px-5'}>
      {Array.from({ length: count }, (_, i) => i + 1).map(item => (
        <SkeletonGroup
          key={item}
          isLoading
          isSkeletonOnly
          variant="shimmer"
          className={
            isCard ? 'bg-card flex-row items-center gap-3.5 rounded-2xl px-2.5 py-2.5' : 'flex-row items-center gap-3'
          }>
          <SkeletonGroup.Item className={`${avatarSize} ${avatarRadius}`} />
          <View className="flex-1 gap-1.5">
            <SkeletonGroup.Item className="h-4 w-full rounded-md" />
            <SkeletonGroup.Item className="h-3 w-2/3 rounded-md" />
          </View>
        </SkeletonGroup>
      ))}
    </View>
  )
}
