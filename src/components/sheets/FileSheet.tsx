import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { FileText, Image } from '@tamagui/lucide-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import React, { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text, useTheme, XStack, YStack } from 'tamagui'

import { uploadFiles } from '@/services/FileService'
import { FileType } from '@/types/file'
import { uuid } from '@/utils'
import { getFileType } from '@/utils/file'

interface FileSheetProps {
  files: FileType[]
  setFiles: (files: FileType[]) => void
}

const FileSheet = forwardRef<BottomSheetModal, FileSheetProps>(({ files, setFiles }, ref) => {
  const { t } = useTranslation()
  const theme = useTheme()

  const handleAddImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true
      })

      if (result.canceled) {
        console.log('Image selection was canceled')
        return
      }

      const _files: Omit<FileType, 'md5'>[] = result.assets.map(asset => {
        const id = uuid()
        return {
          id: id,
          name: asset.fileName || id,
          origin_name: asset.fileName || id,
          path: asset.uri,
          size: asset.fileSize || 0,
          ext: asset.fileName?.split('.').pop() || 'png',
          type: getFileType(asset.fileName?.split('.').pop() || 'png'),
          mime_type: asset.mimeType || '',
          created_at: new Date().toISOString(),
          count: 1
        }
      })
      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
    } catch (error) {
      console.error('Error selecting image:', error)
    } finally {
      ;(ref as React.MutableRefObject<BottomSheetModal>)?.current?.dismiss()
    }
  }

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true })

      if (result.canceled) {
        console.log('File selection was canceled')
        return
      }

      const _files: Omit<FileType, 'md5'>[] = result.assets.map(asset => {
        return {
          id: uuid(),
          name: asset.name,
          origin_name: asset.name,
          path: asset.uri,
          size: asset.size || 0,
          ext: asset.name.split('.').pop() || '',
          type: getFileType(asset.name.split('.').pop() || ''),
          mime_type: asset.mimeType || '',
          created_at: new Date().toISOString(),
          count: 1
        }
      })
      const uploadedFiles = await uploadFiles(_files)
      setFiles([...files, ...uploadedFiles])
    } catch (error) {
      console.error('Error selecting file:', error)
    } finally {
      ;(ref as React.MutableRefObject<BottomSheetModal>)?.current?.dismiss()
    }
  }

  const options = [
    {
      key: 'photo',
      label: t('common.photo'),
      icon: <Image size={24} />,
      onPress: handleAddImage
    },
    {
      key: 'file',
      label: t('common.file'),
      icon: <FileText size={24} />,
      onPress: handleAddFile
    }
  ]

  // 添加背景组件渲染函数
  const renderBackdrop = (props: any) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
  )

  return (
    <BottomSheetModal
      snapPoints={['25%']}
      enableDynamicSizing={true}
      ref={ref}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: theme.gray2.val
      }}
      handleIndicatorStyle={{
        backgroundColor: theme.color.val
      }}
      backdropComponent={renderBackdrop}>
      <BottomSheetView>
        <YStack gap={12} padding="20">
          {options.map(option => (
            <Button
              key={option.key}
              size="$4"
              color="white"
              onPress={option.onPress}
              justifyContent="flex-start"
              paddingHorizontal={20}
              chromeless>
              <XStack gap={12} alignItems="center">
                {option.icon}
                <Text color="white" fontSize={16}>
                  {option.label}
                </Text>
              </XStack>
            </Button>
          ))}
        </YStack>
      </BottomSheetView>
    </BottomSheetModal>
  )
})

FileSheet.displayName = 'FileSheet'

export default FileSheet
