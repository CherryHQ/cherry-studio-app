import { BottomSheet, Button, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  API_KEY_ERROR_LABELS,
  type ApiKeyValidationError,
} from '../../../apiService/utils/providerApiServiceApiKeys';

export type ProviderApiKeySheetState = {
  draft: ApiKeyEntry;
  isKeyTouched: boolean;
  isNew: boolean;
  open: boolean;
};

/**
 * Adds a key or edits one. The owner keeps the draft, so nothing is written until the
 * user confirms, and this stays presentational inside the sheet's portal.
 */
export function ProviderApiKeySheet({
  disabled,
  error,
  onChange,
  onClose,
  onRemove,
  onSubmit,
  state,
}: {
  disabled: boolean;
  error: ApiKeyValidationError | undefined;
  onChange: (updates: Partial<Pick<ApiKeyEntry, 'key' | 'label'>>) => void;
  onClose: () => void;
  onRemove: () => void;
  onSubmit: () => void;
  state: ProviderApiKeySheetState | null;
}) {
  const { t } = useTranslation();
  if (!state) return null;
  const visibleError = state.isKeyTouched ? error : undefined;

  return (
    <BottomSheet
      avoidKeyboard
      closeAction={{ accessibilityLabel: t('common.cancel') }}
      footer={
        <View className="gap-2">
          <Button
            disabled={disabled || Boolean(error)}
            onPress={onSubmit}
            testID="provider-api-key-submit"
          >
            {t(state.isNew ? 'settings.provider.apiService.keys.add' : 'common.save')}
          </Button>
          {state.isNew ? null : (
            <Button
              disabled={disabled}
              onPress={onRemove}
              testID="provider-api-key-remove"
              variant="destructive"
            >
              {t('common.delete')}
            </Button>
          )}
        </View>
      }
      onClose={onClose}
      open={state.open}
      size="medium"
      testID="provider-api-key-editor"
      title={t(
        state.isNew
          ? 'settings.provider.apiService.keys.add'
          : 'settings.provider.apiService.keys.editTitle',
      )}
    >
      <View className="gap-4 px-4 pt-1">
        <TextField disabled={disabled} invalid={Boolean(visibleError)} required>
          <TextField.Label>{t('settings.provider.apiService.apiKey')}</TextField.Label>
          <Input
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            autoFocus={state.isNew}
            disabled={disabled}
            invalid={Boolean(visibleError)}
            onChangeText={(key) => onChange({ key })}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            returnKeyType="done"
            testID="provider-api-key-input"
            type="password"
            value={state.draft.key}
            visibilityAccessibilityLabels={{
              hide: t('settings.provider.apiService.hideApiKeys'),
              show: t('settings.provider.apiService.showApiKeys'),
            }}
          />
          <TextField.Error>
            {visibleError ? t(API_KEY_ERROR_LABELS[visibleError]) : undefined}
          </TextField.Error>
        </TextField>
        <TextField disabled={disabled}>
          <TextField.Label>{t('settings.provider.apiService.keys.label')}</TextField.Label>
          <Input
            accessibilityLabel={t('settings.provider.apiService.keys.label')}
            disabled={disabled}
            onChangeText={(label) => onChange({ label })}
            returnKeyType="done"
            testID="provider-api-key-label"
            value={state.draft.label ?? ''}
          />
          <TextField.Description>
            {t('settings.provider.apiService.keys.labelHelp')}
          </TextField.Description>
        </TextField>
      </View>
    </BottomSheet>
  );
}
