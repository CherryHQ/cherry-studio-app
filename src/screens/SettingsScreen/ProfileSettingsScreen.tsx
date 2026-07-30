import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { loggerService } from '@logger';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { Input } from 'heroui-native/input';
import { useToast } from 'heroui-native/toast';
import { SaveIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { ProfileAvatarEditBadge, ProfileAvatarImage } from '@/components/ProfileAvatar';
import { usePreference } from '@/data/hooks';
import { replaceUserAvatar } from '@/services/avatars/userAvatarStorage';

const profileAvatarSize = 104;
const logger = loggerService.withContext('ProfileSettingsScreen');

type AvatarSourceValue = 'camera' | 'photos';

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const borderColor = useThemeColor('border');
  const inputRef = useRef<TextInput>(null);
  const [userName, setUserName] = usePreference('app.user.name');
  const [avatar, setAvatar] = usePreference('app.user.avatar');
  const [nameDraft, setNameDraft] = useState(userName);
  const avatarActions = useMemo<MenuAction[]>(
    () => [
      {
        id: 'camera',
        image: 'camera',
        title: t('chat.media.camera'),
      },
      {
        id: 'photos',
        image: 'photo',
        title: t('chat.media.photos'),
      },
    ],
    [t],
  );

  const persistSelectedAvatar = useCallback(
    (sourceUri: string) =>
      replaceUserAvatar(sourceUri, avatar, (nextAvatar) =>
        setAvatar(nextAvatar, { optimistic: true }),
      ),
    [avatar, setAvatar],
  );
  const reportAvatarSaveError = useCallback(
    (error: unknown) => {
      logger.error('Failed to save user avatar', error as Error);
      toast.show({ label: t('settings.profile.avatarSaveError'), variant: 'danger' });
    },
    [t, toast],
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

  const handleAvatarSourceChange = useCallback(
    (event: NativeActionEvent) => {
      const nextValue = event.nativeEvent.event as AvatarSourceValue;

      if (nextValue === 'camera') {
        void selectAvatarFromCamera();
        return;
      }

      if (nextValue === 'photos') {
        void selectAvatarFromPhotoLibrary();
      }
    },
    [selectAvatarFromCamera, selectAvatarFromPhotoLibrary],
  );
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
        androidIcon: SaveIcon,
        icon: 'checkmark',
        key: 'finish-profile-edit',
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
              actions={avatarActions}
              accessibilityLabel={t('settings.profile.changeAvatar')}
              onPress={blurInput}
              onPressAction={handleAvatarSourceChange}
              size={profileAvatarSize}
            />
          </View>
          <View className="gap-2">
            <Text className="font-medium text-foreground text-sm">
              {t('settings.profile.userName')}
            </Text>
            <Input
              accessibilityLabel={t('settings.profile.userName')}
              autoCorrect={false}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              onChangeText={setNameDraft}
              onSubmitEditing={blurInput}
              placeholderColorClassName="accent-muted"
              ref={inputRef}
              returnKeyLabel="done"
              returnKeyType="done"
              style={[styles.input, { borderColor }]}
              value={nameDraft}
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

type MenuAvatarTriggerProps = {
  accessibilityLabel: string;
  actions: MenuAction[];
  onPress: () => void;
  onPressAction: (event: NativeActionEvent) => void;
  size: number;
};

function MenuAvatarTrigger({
  accessibilityLabel,
  actions,
  onPress,
  onPressAction,
  size,
}: MenuAvatarTriggerProps) {
  return (
    <View
      onStartShouldSetResponderCapture={() => {
        onPress();
        return false;
      }}
      style={{ height: size, width: size }}
    >
      <ProfileAvatarImage size={size} />
      <MenuView actions={actions} onPressAction={onPressAction} style={styles.avatarMenuTrigger}>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          style={{ height: size, width: size }}
        >
          <ProfileAvatarEditBadge icon="camera" size={size} />
        </View>
      </MenuView>
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
  input: {
    borderWidth: 1,
    height: 48,
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});
