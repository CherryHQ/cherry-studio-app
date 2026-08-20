import { Menu, type MenuItem } from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import { type ReactElement, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

type AvatarImagePickerProps = {
  accessibilityLabel: string;
  children: ReactElement;
  onBeforeOpen?: () => void;
  onError: (error: unknown) => void;
  onSelect: (sourceUri: string) => Promise<void> | void;
  size: number;
};

type PickerSource = 'camera' | 'photos';

/**
 * Shared camera/library entry point for user-customizable avatars. This owns
 * acquisition and square cropping only; the receiving domain owns persistence.
 */
export function AvatarImagePicker({
  accessibilityLabel,
  children,
  onBeforeOpen,
  onError,
  onSelect,
  size,
}: AvatarImagePickerProps) {
  const { t } = useTranslation();
  const isSelectingRef = useRef(false);

  const selectImage = useCallback(
    async (source: PickerSource) => {
      if (isSelectingRef.current) {
        return;
      }

      isSelectingRef.current = true;
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync(false);

        if (!permission.granted) {
          return;
        }

        const commonOptions = {
          allowsEditing: true,
          aspect: [1, 1] as [number, number],
          mediaTypes: ['images'] as ImagePicker.MediaType[],
          quality: 1,
        };
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(commonOptions)
            : await ImagePicker.launchImageLibraryAsync({
                ...commonOptions,
                selectionLimit: 1,
              });
        const assetUri = result.canceled ? undefined : result.assets[0]?.uri;

        if (assetUri) {
          await onSelect(assetUri);
        }
      } catch (error) {
        onError(error);
      } finally {
        isSelectingRef.current = false;
      }
    },
    [onError, onSelect],
  );
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'camera',
        label: t('chat.media.camera'),
        onPress: () => void selectImage('camera'),
        systemImage: 'camera',
      },
      {
        id: 'photos',
        label: t('chat.media.photos'),
        onPress: () => void selectImage('photos'),
        systemImage: 'photo',
      },
    ],
    [selectImage, t],
  );

  return (
    <Menu items={menuItems} trigger="tap">
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onStartShouldSetResponderCapture={() => {
          onBeforeOpen?.();
          return false;
        }}
        style={{ height: size, width: size }}
      >
        {children}
      </View>
    </Menu>
  );
}
