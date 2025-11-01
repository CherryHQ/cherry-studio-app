import { SkeletonGroup } from 'heroui-native'
import React from 'react'

export const ImageSkeleton = () => {
  return (
    <SkeletonGroup className="aspect-square w-1/3">
      <SkeletonGroup.Item className="h-full w-full rounded-lg"></SkeletonGroup.Item>
    </SkeletonGroup>
  )
}
