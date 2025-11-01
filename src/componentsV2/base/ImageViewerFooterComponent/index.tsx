import React from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import { Download } from '@/componentsV2/icons/LucideIcon'
import { useToast } from '@/hooks/useToast'
import { downloadFileAsync, writeBase64File } from '@/services/FileService'
import { SaveImageResult, saveImageToGallery } from '@/services/ImageService'
import { DEFAULT_IMAGES_STORAGE } from '@/constants/storage'
import { Paths, File } from 'expo-file-system'
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
    <View className="p-safe w-full items-center">
      <TouchableOpacity activeOpacity={0.8} onPress={handleSave} className="flex-row items-center gap-2">
        <Download size={18} />
        <Text className="text-lg">{t('button.save_image')}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default ImageViewerFooterComponent
