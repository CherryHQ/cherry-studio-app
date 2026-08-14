import { Input, Label, Menu, type MenuItem, TextField } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAlert } from '@/frontend/components/AlertProvider';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { ProfileAvatarEditBadge, ProfileAvatarImage } from '@/frontend/components/ProfileAvatar';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';

const profileAvatarSize = 104;
const logger = loggerService.withContext('ProfileSettingsScreen');

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const inputRef = useRef<TextInput>(null);
  const [userName, setUserName] = usePreference('app.user.name');
  const profile = useBackendModule('profile');
  const [nameDraft, setNameDraft] = useState(userName);
  const persistSelectedAvatar = useCallback(
    (sourceUri: string) => profile.persistAvatar(sourceUri),
    [profile],
  );
  const reportAvatarSaveError = useCallback(
    (error: unknown) => {
      logger.error('Failed to save user avatar', error as Error);
      alert.show({ title: t('settings.profile.avatarSaveError') });
    },
    [alert, t],
  );

  const selectAvatarFromCamera = useCallback(async () => {
    try {
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
        await persistSelectedAvatar(assetUri);
      }
    } catch (error) {
      reportAvatarSaveError(error);
    }
  }, [persistSelectedAvatar, reportAvatarSaveError]);

  const selectAvatarFromPhotoLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 1,
        selectionLimit: 1,
      });

      const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
      if (assetUri) {
        await persistSelectedAvatar(assetUri);
      }
    } catch (error) {
      reportAvatarSaveError(error);
    }
  }, [persistSelectedAvatar, reportAvatarSaveError]);

  const blurInput = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);
  const finishEditing = useCallback(() => {
    blurInput();
    if (nameDraft !== userName) {
      void setUserName(nameDraft, { optimistic: true });
    }
    router.back();
  }, [blurInput, nameDraft, router, setUserName, userName]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        key: 'finish-profile-edit',
        label: t('common.save'),
        onPress: finishEditing,
      },
    ],
    [finishEditing, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.profile.edit')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-8 px-6 py-8">
          <View className="items-center">
            <MenuAvatarTrigger
              accessibilityLabel={t('settings.profile.changeAvatar')}
              cameraLabel={t('chat.media.camera')}
              onPress={blurInput}
              onSelectCamera={selectAvatarFromCamera}
              onSelectPhotos={selectAvatarFromPhotoLibrary}
              photosLabel={t('chat.media.photos')}
              size={profileAvatarSize}
            />
          </View>
          <TextField>
            <Label>{t('settings.profile.userName')}</Label>
            <Input
              accessibilityLabel={t('settings.profile.userName')}
              autoCorrect={false}
              onChangeText={setNameDraft}
              onSubmitEditing={blurInput}
              ref={inputRef}
              returnKeyLabel="done"
              returnKeyType="done"
              value={nameDraft}
            />
          </TextField>
        </View>
      </ScrollView>
    </>
  );
}

type MenuAvatarTriggerProps = {
  accessibilityLabel: string;
  cameraLabel: string;
  onPress: () => void;
  onSelectCamera: () => Promise<void>;
  onSelectPhotos: () => Promise<void>;
  photosLabel: string;
  size: number;
};

function MenuAvatarTrigger({
  accessibilityLabel,
  cameraLabel,
  onPress,
  onSelectCamera,
  onSelectPhotos,
  photosLabel,
  size,
}: MenuAvatarTriggerProps) {
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'camera',
        label: cameraLabel,
        onPress: () => void onSelectCamera(),
        systemImage: 'camera',
      },
      {
        id: 'photos',
        label: photosLabel,
        onPress: () => void onSelectPhotos(),
        systemImage: 'photo',
      },
    ],
    [cameraLabel, onSelectCamera, onSelectPhotos, photosLabel],
  );

  return (
    <View
      onStartShouldSetResponderCapture={() => {
        onPress();
        return false;
      }}
      style={{ height: size, width: size }}
    >
      <ProfileAvatarImage size={size} />
      <View style={styles.avatarMenuTrigger}>
        <Menu items={menuItems} trigger="tap">
          <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            style={{ height: size, width: size }}
          >
            <ProfileAvatarEditBadge icon="camera" size={size} />
          </View>
        </Menu>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarMenuTrigger: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
