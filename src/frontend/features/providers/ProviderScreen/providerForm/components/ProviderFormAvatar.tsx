import { loggerService } from '@logger';
import { type ReactElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import { AvatarPickerField, BrandAvatar, BrandAvatarPhoto } from '@/frontend/components/avatar';

import { useProviderForm } from '../context';

export const providerFormAvatarSize = 96;
const logger = loggerService.withContext('ProviderFormAvatar');

/**
 * Avatar picker. `children` is what shows when the draft has no picked image —
 * the create screen leaves it out and gets the generated initial tile, the edit
 * screen passes the provider's built-in logo, so an untouched avatar previews
 * what the provider will actually look like rather than what is still on disk.
 */
export function ProviderFormAvatar({ children }: { children?: ReactElement }) {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.Avatar');
  const { setAvatarUri } = actions;

  const reportPickError = useCallback((error: unknown) => {
    logger.error('Failed to pick a provider avatar', error as Error);
  }, []);

  return (
    // The block sits further from the first field than the fields do from each
    // other, so it carries that extra space rather than the form's shared gap.
    <View
      accessibilityState={{ disabled: meta.isSubmitting }}
      className="pb-5"
      pointerEvents={meta.isSubmitting ? 'none' : 'auto'}
    >
      <AvatarPickerField
        caption={t('settings.provider.add.setAvatar')}
        onBeforeOpen={Keyboard.dismiss}
        onError={reportPickError}
        onSelect={setAvatarUri}
      >
        {state.avatarUri ? (
          <BrandAvatar label={state.name} shape="circle" size={providerFormAvatarSize}>
            <BrandAvatarPhoto uri={state.avatarUri} />
          </BrandAvatar>
        ) : (
          (children ?? (
            <BrandAvatar label={state.name} shape="circle" size={providerFormAvatarSize} />
          ))
        )}
      </AvatarPickerField>
    </View>
  );
}

ProviderFormAvatar.displayName = 'ProviderForm.Avatar';
