import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import PencilIcon from '@cherrystudio/app-icons/icons/pencil';
import { Button } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, Text, View } from 'react-native';

import {
  AvatarImagePicker,
  BrandAvatar,
  BrandAvatarPhoto,
  ProviderBrandAvatar,
} from '@/frontend/components/Avatar';

import type { ProviderConfigurationValue } from '../types';
import { ProviderValueSheet } from './ProviderValueSheet';

const IDENTITY_AVATAR_SIZE = 56;
const logger = loggerService.withContext('ProviderIdentitySection');

/** The provider at a glance: its mark, name and state. Renaming and the avatar are edited in place. */
export function ProviderIdentitySection({ value }: { value: ProviderConfigurationValue }) {
  const { t } = useTranslation();
  const [renameDraft, setRenameDraft] = useState<{ open: boolean; text: string } | null>(null);
  const trimmedDraft = renameDraft?.text.trim() ?? '';
  const displayName = value.name || t('settings.provider.config.unnamed');

  const openRename = () => {
    Keyboard.dismiss();
    setRenameDraft({ open: true, text: value.name });
  };
  const closeRename = () => setRenameDraft((current) => current && { ...current, open: false });
  const submitRename = () => {
    if (!trimmedDraft) return;
    void value.actions.rename(trimmedDraft);
    closeRename();
  };

  return (
    <>
      <View className="flex-row items-center gap-4 px-1">
        <AvatarImagePicker
          accessibilityLabel={t('settings.provider.add.setAvatar')}
          onBeforeOpen={Keyboard.dismiss}
          onError={(error) => logger.error('Failed to pick a provider avatar', error as Error)}
          onSelect={(uri) => void value.actions.setAvatar(uri)}
          size={IDENTITY_AVATAR_SIZE}
        >
          <View>
            {value.avatarUri ? (
              <BrandAvatar label={value.name} size={IDENTITY_AVATAR_SIZE}>
                <BrandAvatarPhoto uri={value.avatarUri} />
              </BrandAvatar>
            ) : (
              <ProviderBrandAvatar
                presetProviderId={value.presetProviderId}
                providerId={value.providerId}
                // The generated initial comes from the real name, never the placeholder.
                providerName={value.name}
                size={IDENTITY_AVATAR_SIZE}
              />
            )}
            <View className="absolute -right-1 -bottom-1 size-6 items-center justify-center rounded-full border border-border bg-card">
              <CameraIcon className="size-3.5 text-muted-foreground" />
            </View>
          </View>
        </AvatarImagePicker>
        <Pressable
          accessibilityHint={t('common.rename')}
          accessibilityRole="button"
          className="min-w-0 flex-1 gap-0.5 active:opacity-70"
          onPress={openRename}
        >
          <Text
            className={
              value.name ? 'text-xl font-semibold text-foreground' : 'text-xl text-muted-foreground'
            }
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {value.status ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {value.status}
            </Text>
          ) : null}
        </Pressable>
        <Button
          accessibilityLabel={t('common.rename')}
          disabled={value.isBusy}
          icon={<PencilIcon />}
          onPress={openRename}
          testID="provider-rename"
          variant="ghost"
        />
      </View>
      {renameDraft ? (
        <ProviderValueSheet
          label={t('settings.provider.add.name')}
          onChangeText={(text) => setRenameDraft((current) => current && { ...current, text })}
          onClose={closeRename}
          onSubmit={submitRename}
          open={renameDraft.open}
          placeholder={t('settings.provider.add.name')}
          submitDisabled={!trimmedDraft}
          testID="provider-rename-sheet"
          title={t('common.rename')}
          value={renameDraft.text}
        />
      ) : null}
    </>
  );
}
