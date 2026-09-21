import { BottomSheet, Button, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { API_KEY_ERROR_LABELS } from '../../../apiService/utils/providerApiServiceApiKeys';
import type { useProviderApiKeyEditor } from '../hooks/useProviderApiKeyEditor';

export function ProviderApiKeyEditSheet({
  disabled,
  editor,
}: {
  disabled: boolean;
  editor: ReturnType<typeof useProviderApiKeyEditor>;
}) {
  const { t } = useTranslation();
  const { editor: state, error, change, close, add, remove } = editor;
  if (!state) return null;
  const { draft } = state;
  const visibleError = state.isKeyTouched ? error : undefined;

  return (
    <BottomSheet
      closeAction={{ accessibilityLabel: t(state.isNew ? 'common.cancel' : 'common.close') }}
      onClose={close}
      open={state.open}
      size="large"
      testID="provider-api-key-editor"
      title={t(
        state.isNew
          ? 'settings.provider.apiService.keys.add'
          : 'settings.provider.apiService.keys.editTitle',
      )}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.page}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField disabled={disabled} invalid={Boolean(visibleError)} required>
            <TextField.Label>{t('settings.provider.apiService.apiKey')}</TextField.Label>
            <Input
              key={state.open ? draft.id : 'closed'}
              accessibilityLabel={t('settings.provider.apiService.apiKey')}
              disabled={disabled}
              invalid={Boolean(visibleError)}
              onChangeText={(key) => change({ key })}
              placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
              returnKeyType="done"
              testID="provider-api-key-input"
              type="password"
              value={draft.key}
              visibilityAccessibilityLabels={{
                hide: t('settings.provider.apiService.hideApiKeys'),
                show: t('settings.provider.apiService.showApiKeys'),
              }}
            />
            {visibleError ? (
              <TextField.Error>{t(API_KEY_ERROR_LABELS[visibleError])}</TextField.Error>
            ) : null}
          </TextField>
          <TextField disabled={disabled}>
            <TextField.Label>{t('settings.provider.apiService.keys.label')}</TextField.Label>
            <Input
              accessibilityLabel={t('settings.provider.apiService.keys.label')}
              disabled={disabled}
              onChangeText={(label) => change({ label })}
              returnKeyType="done"
              testID="provider-api-key-label"
              value={draft.label ?? ''}
            />
            <TextField.Description>
              {t('settings.provider.apiService.keys.labelHelp')}
            </TextField.Description>
          </TextField>
          <View className="pt-2">
            {state.isNew ? (
              <Button
                disabled={disabled || Boolean(error)}
                onPress={() => {
                  Keyboard.dismiss();
                  add();
                }}
                testID="provider-api-key-create"
              >
                {t('settings.provider.apiService.keys.add')}
              </Button>
            ) : (
              <Button
                disabled={disabled}
                onPress={() => {
                  Keyboard.dismiss();
                  remove();
                }}
                testID="provider-api-key-remove"
                variant="destructive"
              >
                {t('common.delete')}
              </Button>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
});
