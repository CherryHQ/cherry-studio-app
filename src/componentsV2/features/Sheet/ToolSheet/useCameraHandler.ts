import type { CameraView } from 'expo-camera'
import { useCameraPermissions } from 'expo-camera'
import { useRef, useState } from 'react'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('Camera Handler')

interface UseCameraHandlerProps {
  onPhotoTaken: (photoUri: string) => void
  onSuccess?: () => void
}

export const useCameraHandler = ({ onPhotoTaken, onSuccess }: UseCameraHandlerProps) => {
  const [isCameraVisible, setCameraVisible] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)

  const handleOpenCamera = async () => {
    const cameraPermission = await requestPermission()

    if (!cameraPermission.granted) {
      logger.info('Camera permission denied')
      return
    }

    setCameraVisible(true)
  }

  const handleCloseCamera = () => {
    setCameraVisible(false)
  }

  const handleTakePicture = async () => {
    if (!cameraRef.current) {
      return
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.2 })

      if (photo) {
        onPhotoTaken(photo.uri)
        onSuccess?.()
      }
    } catch (error) {
      logger.error('Error taking picture:', error)
    } finally {
      setCameraVisible(false)
    }
  }

  return {
    isCameraVisible,
    cameraRef,
    permission,
    handleOpenCamera,
    handleCloseCamera,
    handleTakePicture
  }
}
