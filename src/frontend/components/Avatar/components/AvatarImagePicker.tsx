import { ActionMenu, type MenuItem } from '@cherrystudio/ui/components';
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
  /**
   * Pins the trigger to a square of this size, so an avatar that has not
   * loaded yet still presents a full-size tap target. Omit it when the trigger
   * is a composed block — an avatar with a caption under it — and should size
   * itself to its content.
   */
  size?: number;
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
        if (source === 'camera') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();

          if (!permission.granted) {
            return;
          }
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
      },
      {
        id: 'photos',
        label: t('chat.media.photos'),
        onPress: () => void selectImage('photos'),
      },
    ],
    [selectImage, t],
  );

  return (
    <ActionMenu items={menuItems}>
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onStartShouldSetResponderCapture={() => {
          onBeforeOpen?.();
          return false;
        }}
        style={size === undefined ? undefined : { height: size, width: size }}
      >
        {children}
      </View>
    </ActionMenu>
  );
}
