import { Button, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';

import { ProviderBottomAction } from '../../../components/ProviderBottomAction';
import {
  ProviderModelSettings,
  useNewModelSettings,
} from '../../../models/components/ProviderModelSettings';
import { useProviderModelAdd } from '../../../models/hooks/useProviderModelAdd';
import { useProviderModelTask } from '../hooks/useProviderModelTask';
import type { ProviderModelTaskProps } from '../types';
import { ProviderModelSetupCompletion } from './ProviderModelSetupCompletion';

/**
 * Adding one model by ID. Below the ID it shows the same settings rows as a saved model's
 * details; they edit the draft, which is created once with Add.
 */
export function ProviderModelManualForm({
  provider,
  returnTo,
  shouldEnableProvider,
}: ProviderModelTaskProps) {
  const { t } = useTranslation();
  const add = useProviderModelAdd({ provider });
  const settings = useNewModelSettings(add, provider);
  const flow = useProviderModelTask({
    hasUnsavedChanges: add.isDirty,
    isSaving: add.isSubmitting,
    provider,
    returnTo,
    shouldEnableProvider,
  });
  const isCompleting = flow.hasSavedModels && shouldEnableProvider;
  const isBusy = add.isSubmitting || flow.isEnabling;

  async function handleSubmit() {
    Keyboard.dismiss();
    if (await add.submitAddModel()) await flow.completeAfterSave();
  }

  return (
    <>
      <RouteHeader onBack={flow.requestClose} title={t('settings.provider.models.addTitle')} />
      {isCompleting ? (
        <ProviderModelSetupCompletion
          isEnabling={flow.isEnabling}
          onAddModel={flow.openManualAdd}
          onComplete={flow.completeFlow}
          onConfigure={flow.openConfiguration}
        />
      ) : (
        <View className="flex-1">
          <KeyboardAwareScrollView
            bottomOffset={16}
            contentContainerStyle={styles.scrollContent}
            contentInsetAdjustmentBehavior="automatic"
            disableScrollOnKeyboardHide
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            mode="layout"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-2">
              <TextField
                disabled={add.isSubmitting}
                invalid={Boolean(add.fieldErrors.modelId)}
                required
              >
                <TextField.Label>{t('settings.provider.models.addModelIdLabel')}</TextField.Label>
                <Input
                  accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={add.updateModelId}
                  placeholder={t('settings.provider.models.addModelIdPlaceholder')}
                  returnKeyType="done"
                  testID="model-add-id"
                  value={add.formState.modelId}
                />
                <TextField.Error>{add.fieldErrors.modelId}</TextField.Error>
              </TextField>
              {add.hasLookupError ? (
                <View className="items-start gap-2">
                  <Text className="text-error text-xs">
                    {t('settings.provider.models.addLookupFailed')}
                  </Text>
                  <Button onPress={() => void add.retryLookup()} size="inline" variant="ghost">
                    <Button.Label>{t('common.retry')}</Button.Label>
                  </Button>
                </View>
              ) : add.isResolving ? (
                <Text className="text-muted-foreground text-xs">
                  {t('settings.provider.models.addResolving')}
                </Text>
              ) : null}
            </View>
            <ProviderModelSettings value={settings} />
          </KeyboardAwareScrollView>
          <ProviderBottomAction
            disabled={!add.canSubmit || isBusy}
            label={isBusy ? t('common.saving') : t('settings.provider.models.add')}
            loading={isBusy}
            onPress={() => void handleSubmit()}
            testID="model-add-submit"
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 24,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
});
