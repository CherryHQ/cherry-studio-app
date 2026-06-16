import { CameraIcon, ChevronLeftIcon, SwitchCameraIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  type CameraPosition,
  type PhotoFile,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { CameraControlButton } from './CameraControlButton/CameraControlButton';
import { CameraShutterButton } from './CameraShutterButton/CameraShutterButton';

type ChatInputInlineCameraProps = {
  // Whether the host sheet currently shows the camera. Drives VisionCamera's
  // `isActive` so the capture session only runs while visible (battery + heat).
  isActive: boolean;
  onBack: () => void;
  onCapture: (photo: PhotoFile) => void;
  onError: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * ChatGPT-style inline camera that lives INSIDE the "+" action sheet (mirrors
 * the inline photo picker): a full-bleed VisionCamera preview fills the entire
 * sheet, with self-drawn back / shutter / flip controls FLOATING on top of it
 * (transparent control bar, no black strip stealing preview space). Capture
 * writes a JPEG to a temp path that the caller turns into an attachment draft.
 */
export function ChatInputInlineCamera({
  isActive,
  onBack,
  onCapture,
  onError,
  style,
}: ChatInputInlineCameraProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<CameraPosition>('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isForeground, setIsForeground] = useState(true);
  const device = useCameraDevice(position);
  // VisionCamera v5 routes capture through a photo "output" attached to the
  // <Camera>; force JPEG so the attachment's image/jpeg media type is accurate.
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg' });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);
  const { hasPermission, requestPermission } = useCameraPermission();

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Suspend the capture session while the app is backgrounded; VisionCamera
  // expects `isActive` to track foreground state, not just visibility.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setIsForeground(status === 'active');
    });

    return () => subscription.remove();
  }, []);

  const handleFlip = useCallback(() => {
    setPosition((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  const handleCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await photoOutput.capturePhotoToFile({}, {});
      onCapture(photo);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture, onError, photoOutput]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const canCapture = hasPermission && device != null;

  return (
    <View className="flex-1 bg-black" style={style}>
      {canCapture ? (
        // Full-bleed preview: fills the whole sheet, controls float over it.
        <Camera
          device={device}
          isActive={isActive && isForeground}
          outputs={outputs}
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
      <View
        className="absolute inset-x-0 bottom-0 flex-row items-center justify-between px-10 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
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
          disabled={!canCapture}
          icon={SwitchCameraIcon}
          onPress={handleFlip}
          sfSymbol="camera.rotate"
        />
      </View>
    </View>
  );
}
