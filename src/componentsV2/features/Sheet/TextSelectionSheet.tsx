import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useTheme } from 'heroui-native'
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, TouchableOpacity } from 'react-native'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { X } from '@/componentsV2/icons'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'

interface TextSelectionSheetProps {
  content: string
}

export interface TextSelectionSheetRef {
  present: () => void
  dismiss: () => void
}

// TODO: 自定义选择后弹出的菜单
function SelectableText({ children }) {
  if (Platform.OS === 'ios') {
    return (
      <TextField className="h-full w-full">
        <TextField.Input
          className="h-full w-full rounded-none border-0 px-4 text-sm leading-6"
          multiline
          editable={false}
          value={children}
        />
      </TextField>
    )
  } else {
    return <Text className="text-sm leading-6">{children}</Text>
  }
}

const TextSelectionSheet = forwardRef<TextSelectionSheetRef, TextSelectionSheetProps>(({ content }, ref) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)
  const [isVisible, setIsVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    present: () => bottomSheetModalRef.current?.present(),
    dismiss: () => bottomSheetModalRef.current?.dismiss()
  }))

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      bottomSheetModalRef.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={['90%']}
      enableDynamicSizing={false}
      backgroundStyle={{
        borderRadius: 24,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      backdropComponent={renderBackdrop}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <YStack className="flex-1">
        <XStack className="items-center justify-between border-b border-black/10 px-4 pb-4 dark:border-white/10">
          <Text className="text-base font-bold">{t('common.select_text')}</Text>
          <TouchableOpacity
            style={{
              padding: 4,
              backgroundColor: isDark ? '#333333' : '#dddddd',
              borderRadius: 16
            }}
            onPress={() => bottomSheetModalRef.current?.dismiss()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={16} />
          </TouchableOpacity>
        </XStack>
        <BottomSheetScrollView
          contentContainerStyle={{
            flex: 1,
            height: '100%',
            width: '100%'
          }}>
          <SelectableText>{content}</SelectableText>
        </BottomSheetScrollView>
      </YStack>
    </BottomSheetModal>
  )
})

TextSelectionSheet.displayName = 'TextSelectionSheet'

export default TextSelectionSheet
