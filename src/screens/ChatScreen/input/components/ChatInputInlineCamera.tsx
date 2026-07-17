import {
  type CameraCapturedPicture,
  type CameraType,
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { CameraIcon, ChevronLeftIcon, SwitchCameraIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  Linking,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { CameraControlButton } from './CameraControlButton/CameraControlButton';
import { CameraShutterButton } from './CameraShutterButton/CameraShutterButton';
import { ChatInputMediaControlOverlay } from './ChatInputMediaControlOverlay';

type ChatInputInlineCameraProps = {
  bottomInset: number;
  // Whether the host sheet currently shows the camera. The preview is removed
  // while inactive so Android also releases the capture session.
  isActive: boolean;
  onBack: () => void;
  onCapture: (photo: CameraCapturedPicture) => void;
  onError: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * ChatGPT-style inline camera that lives INSIDE the "+" action sheet (mirrors
 * the inline photo picker): a full-bleed Expo Camera preview fills the entire
 * sheet, with self-drawn back / shutter / flip controls FLOATING on top of it
 * (transparent control bar, no black strip stealing preview space). Capture
 * writes a JPEG to a temp path that the caller turns into an attachment draft.
 */
export function ChatInputInlineCamera({
  bottomInset,
  isActive,
  onBack,
  onCapture,
  onError,
  style,
}: ChatInputInlineCameraProps) {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraView>(null);
  const didRequestPermissionRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isForeground, setIsForeground] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasMountError, setHasMountError] = useState(false);

  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !didRequestPermissionRef.current
    ) {
      didRequestPermissionRef.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setIsForeground(status === 'active');
    });

    return () => subscription.remove();
  }, []);

  const handleFlip = useCallback(() => {
    setIsCameraReady(false);
    setHasMountError(false);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  const handleCapture = useCallback(async () => {
    if (isCapturing || !isCameraReady || !cameraRef.current) {
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
      });
      onCapture(photo);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }, [isCameraReady, isCapturing, onCapture, onError]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const hasPermission = permission?.granted ?? false;
  const canUseCamera = hasPermission && !hasMountError;
  const shouldRenderCamera = canUseCamera && isActive && isForeground;
  const canCapture = shouldRenderCamera && isCameraReady;

  return (
    <View className="flex-1 bg-black" style={style}>
      {shouldRenderCamera ? (
        // Full-bleed preview: fills the whole sheet, controls float over it.
        <CameraView
          ref={cameraRef}
          active={isActive && isForeground}
          facing={facing}
          mirror={facing === 'front'}
          mode="picture"
          onCameraReady={() => {
            setIsCameraReady(true);
          }}
          onMountError={(error) => {
            setHasMountError(true);
            setIsCameraReady(false);
            onError(error.message);
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View className="absolute inset-0 items-center justify-center gap-3 px-8">
          <CameraIcon className="size-10 text-white/70" strokeWidth={1.5} />
          <Text className="text-center font-semibold text-lg text-white">
            {hasPermission
              ? t('chat.media.cameraUnavailable')
              : t('chat.media.cameraPermissionTitle')}
          </Text>
          {hasPermission ? null : (
            <>
              <Text className="text-center text-sm text-white/70">
                {t('chat.media.cameraPermissionDescription')}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="mt-1 rounded-full bg-white/15 px-5 py-2.5 active:opacity-70"
                onPress={handleOpenSettings}
              >
                <Text className="font-semibold text-base text-white">
                  {t('chat.media.openSettings')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* Floating control bar: transparent, overlaid on the bottom of the
          preview; buttons keep a translucent dark backing so they stay legible
          over bright scenes. The bottom safe-area inset is applied here so the
          preview itself still runs edge-to-edge under the home indicator. */}
      <ChatInputMediaControlOverlay>
        <View
          className="absolute inset-x-0 flex-row items-center justify-between px-10"
          style={[styles.controlBar, { bottom: Math.max(bottomInset, 16) }]}
          testID="chat-input-camera-controls"
        >
          <CameraControlButton
            accessibilityLabel={t('common.back')}
            icon={ChevronLeftIcon}
            onPress={onBack}
            sfSymbol="chevron.left"
          />

          <CameraShutterButton
            accessibilityLabel={t('chat.media.takePhoto')}
            disabled={!canCapture || isCapturing}
            onPress={handleCapture}
          />

          <CameraControlButton
            accessibilityLabel={t('chat.media.flipCamera')}
            disabled={!shouldRenderCamera || isCapturing}
            icon={SwitchCameraIcon}
            onPress={handleFlip}
            sfSymbol="camera.rotate"
          />
        </View>
      </ChatInputMediaControlOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  controlBar: {
    height: 72,
  },
});
