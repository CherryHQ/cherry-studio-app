import { CameraView } from 'expo-camera'
import React from 'react'
import { Modal, TouchableOpacity, View } from 'react-native'

import { X } from '@/componentsV2/icons'

import { useCameraHandler } from './useCameraHandler'

interface CameraModalProps {
  onPhotoTaken: (photoUri: string) => void
  onSuccess?: () => void
}

export const useCameraModal = (props: CameraModalProps) => {
  const { isCameraVisible, cameraRef, handleOpenCamera, handleCloseCamera, handleTakePicture } = useCameraHandler(props)

  const modal = (
    <Modal backdropColor="black" visible={isCameraVisible} animationType="slide" onRequestClose={handleCloseCamera}>
      <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef} />

      <TouchableOpacity
        className="absolute left-5 top-[50px] rounded-full bg-black/50 p-1"
        onPress={handleCloseCamera}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X size={32} />
      </TouchableOpacity>

      <View className="absolute bottom-0 left-0 right-0 h-[100px] items-center justify-center">
        <TouchableOpacity
          className="h-[70px] w-[70px] rounded-full border-[5px] border-black/30 bg-white"
          onPress={handleTakePicture}
        />
      </View>
    </Modal>
  )

  return {
    isCameraVisible,
    handleOpenCamera,
    modal
  }
}
