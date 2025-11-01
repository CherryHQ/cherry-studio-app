import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import type { FC } from 'react'
import React, { useRef } from 'react'
import { Pressable } from 'react-native'
import type { SFSymbol } from 'sf-symbols-typescript'
import * as ZeegoContextMenu from 'zeego/context-menu'

import { isAndroid, isIOS } from '@/utils/device'

import SelectionSheet from '../SelectionSheet'

export interface ContextMenuListProps {
  title: string
  iOSIcon?: SFSymbol | string
  androidIcon?: React.ReactNode
  destructive?: boolean
  color?: string
  backgroundColor?: string
  onSelect: () => void
}

export interface ContextMenuProps {
  children: React.ReactNode
  disableContextMenu?: boolean
  borderRadius?: number
  /** 解决子元素有ScrollView时无法横向滚动问题 */
  withHighLight?: boolean
  onPress?: () => void
  list: ContextMenuListProps[]
}

const ContextMenu: FC<ContextMenuProps> = ({
  children,
  onPress = () => {},
  list,
  disableContextMenu = false,
  borderRadius = 0,
  withHighLight = true
}) => {
  const selectionSheetRef = useRef<BottomSheetModal>(null)

  if (isIOS) {
    const { Root, Trigger, Content, Item, ItemTitle, ItemIcon } = ZeegoContextMenu
    const TriggerContent = withHighLight ? (
      <Pressable
        onPress={onPress}
        onLongPress={() => {}}
        unstable_pressDelay={50}
        delayLongPress={350}
        // FIXME: 这里失效了
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#a0a1b033' : 'transparent',
          borderRadius
        })}>
        {children}
      </Pressable>
    ) : (
      children
    )

    if (disableContextMenu) {
      return TriggerContent
    }

    return (
      <Root
        // @ts-expect-error: https://github.com/nandorojo/zeego/issues/80
        __unsafeIosProps={{
          shouldWaitForMenuToHideBeforeFiringOnPressMenuItem: false
        }}>
        <Trigger disabled={disableContextMenu}>{TriggerContent}</Trigger>
        <Content>
          {list.map(item => (
            <Item key={item.title} onSelect={item.onSelect} destructive={item.destructive}>
              <ItemTitle>{item.title}</ItemTitle>
              {item.iOSIcon && <ItemIcon ios={{ name: item.iOSIcon }} />}
            </Item>
          ))}
        </Content>
      </Root>
    )
  }

  if (isAndroid) {
    const openBottomSheet = () => {
      if (disableContextMenu) return
      selectionSheetRef.current?.present()
    }

    const closeBottomSheet = () => {
      selectionSheetRef.current?.dismiss()
    }

    const onAndroidSelect = (fn: () => void) => {
      closeBottomSheet()
      fn()
    }

    return (
      <>
        <Pressable
          android_disableSound={true}
          android_ripple={{ color: '$backgroundGray' }}
          unstable_pressDelay={50}
          delayLongPress={400}
          onPress={onPress}
          onLongPress={openBottomSheet}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#a0a1b033' : 'transparent',
            opacity: pressed ? 0.9 : 1,
            borderRadius
          })}>
          {children}
        </Pressable>

        <SelectionSheet
          ref={selectionSheetRef}
          items={list.map(item => ({
            key: item.title,
            label: item.title,
            icon: item.androidIcon,
            color: item.color,
            backgroundColor: item.backgroundColor,
            onSelect: () => onAndroidSelect(item.onSelect)
          }))}
        />
      </>
    )
  }
}

ContextMenu.displayName = 'ContextMenu'

export default ContextMenu
