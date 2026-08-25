import ImageUpIcon from '@cherrystudio/app-icons/icons/image-up';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import { Button, Menu, type MenuItem } from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BrandAvatar, BrandAvatarPhoto } from '@/frontend/components/avatar';

import { useProviderForm } from '../context';

export const providerFormAvatarSize = 96;

/**
 * Avatar picker. `children` is what shows when the draft has no picked image —
 * the create screen leaves it out and gets the generated initial tile, the edit
 * screen passes the provider's built-in logo, so "reset avatar" previews what
 * the provider will actually look like rather than what is still on disk.
 */
export function ProviderFormAvatar({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { actions, state } = useProviderForm('ProviderForm.Avatar');
  const { setAvatarUri } = actions;

  const selectAvatarFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      setAvatarUri(assetUri);
    }
  }, [setAvatarUri]);

  const selectAvatarFromPhotoLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      setAvatarUri(assetUri);
    }
  }, [setAvatarUri]);

  const resetAvatar = useCallback(() => setAvatarUri(null), [setAvatarUri]);
  const avatarMenuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'camera',
        label: t('chat.media.camera'),
        onPress: () => void selectAvatarFromCamera(),
      },
      {
        id: 'photos',
        label: t('chat.media.photos'),
        onPress: () => void selectAvatarFromPhotoLibrary(),
      },
    ],
    [selectAvatarFromCamera, selectAvatarFromPhotoLibrary, t],
  );

  return (
    <View className="items-center gap-4">
      {state.avatarUri ? (
        <BrandAvatar label={state.name} size={providerFormAvatarSize}>
          <BrandAvatarPhoto uri={state.avatarUri} />
        </BrandAvatar>
      ) : (
        (children ?? <BrandAvatar label={state.name} size={providerFormAvatarSize} />)
      )}
      <View className="flex-row items-center gap-3">
        <Menu items={avatarMenuItems} trigger="tap">
          <Button icon={<ImageUpIcon />} variant="secondary">
            {t('settings.provider.add.uploadImage')}
          </Button>
        </Menu>
        <Button
          disabled={!state.avatarUri}
          icon={<RotateCcwIcon />}
          onPress={resetAvatar}
          variant="secondary"
        >
          {t('settings.provider.add.resetAvatar')}
        </Button>
      </View>
    </View>
  );
}

ProviderFormAvatar.displayName = 'ProviderForm.Avatar';
