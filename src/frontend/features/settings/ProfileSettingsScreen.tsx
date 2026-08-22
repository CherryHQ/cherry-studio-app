import { Input, Label, TextField, useAlert } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, TextInput, View } from 'react-native';

import { AvatarImagePicker, ProfileEditableAvatar } from '@/frontend/components/avatar';
import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
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
        type: 'label',
      },
    ],
    [finishEditing, t],
  );

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('settings.profile.edit')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-8 px-6 py-8">
          <View className="items-center">
            <AvatarImagePicker
              accessibilityLabel={t('settings.profile.changeAvatar')}
              onBeforeOpen={blurInput}
              onError={reportAvatarSaveError}
              onSelect={persistSelectedAvatar}
              size={profileAvatarSize}
            >
              <ProfileEditableAvatar
                accessibilityLabel={t('settings.profile.changeAvatar')}
                icon="camera"
                size={profileAvatarSize}
              />
            </AvatarImagePicker>
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
