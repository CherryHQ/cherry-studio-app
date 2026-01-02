import { File, Paths } from 'expo-file-system'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import Text from '@/componentsV2/base/Text'
import { Download } from '@/componentsV2/icons/LucideIcon'
import { DEFAULT_IMAGES_STORAGE } from '@/constants/storage'
import { useToast } from '@/hooks/useToast'
import { downloadFileAsync, writeBase64File } from '@/services/FileService'
import type { SaveImageResult } from '@/services/ImageService'
import { saveImageToGallery } from '@/services/ImageService'
import { uuid } from '@/utils'

export interface ImageViewerFooterComponentProps {
  uri: string
  onSaved?: () => void
}

const ImageViewerFooterComponent: React.FC<ImageViewerFooterComponentProps> = ({ uri, onSaved }) => {
  const toast = useToast()
  const { t } = useTranslation()

  const handleSave = async () => {
    try {
      const isDataUrl = uri.startsWith('data:')
      const isHttpUrl = uri.startsWith('http://') || uri.startsWith('https://')
      const isFileUrl = uri.startsWith('file:')
      const maybeBase64Only = !isDataUrl && !isHttpUrl && !isFileUrl // 纯 base64 字符串

      let result: SaveImageResult | undefined

      if (isDataUrl || maybeBase64Only) {
        const fileMeta = await writeBase64File(uri)
        result = await saveImageToGallery(fileMeta.path)
      } else if (isFileUrl) {
        result = await saveImageToGallery(uri)
      } else if (isHttpUrl) {
        const destination = new File(Paths.join(DEFAULT_IMAGES_STORAGE, `${uuid}.jpg`))
        const output = await downloadFileAsync(uri, destination)
        result = await saveImageToGallery(output.uri)
      }

      if (result?.success) {
        toast.show(t('common.saved'))
        onSaved?.()
      } else {
        toast.show(result?.message || t('common.error_occurred'), { color: 'red', duration: 2500 })
      }
    } catch {
      toast.show(t('common.error_occurred'), { color: 'red', duration: 2500 })
    }
  }

  return (
    <View className="p-safe-offset-6 w-full items-center">
      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        onPress={handleSave}
        className="flex-row items-center gap-2">
        <Download size={18} color="white" />
        <Text className="text-lg text-white">{t('button.save_image')}</Text>
      </Pressable>
    </View>
  )
}

export default ImageViewerFooterComponent
