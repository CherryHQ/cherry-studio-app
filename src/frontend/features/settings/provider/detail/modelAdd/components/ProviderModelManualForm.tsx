import {
  Button,
  Input,
  OptionPickerBottomSheet,
  Section,
  TextField,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { ENDPOINT_TYPE } from '@/shared/data/types/model';

import { ProviderModelClassificationFields } from '../../../models/components/ProviderModelClassificationFields';
import { ProviderModelFormSection } from '../../../models/components/ProviderModelFormSection';
import { ProviderModelNumberField } from '../../../models/components/ProviderModelNumberField';
import { ProviderModelPricingFields } from '../../../models/components/ProviderModelPricingFields';
import { ProviderModelTypeField } from '../../../models/components/ProviderModelTypeField';
import { useProviderModelAdd } from '../../../models/hooks/useProviderModelAdd';
import {
  getProviderModelEndpointLabelKey,
  getProviderModelAddEndpointOptions,
  getDefaultProviderModelGroupName,
  type ProviderModelAddEndpoint,
} from '../../../models/utils/providerModelAdd';
import { useProviderModelTask } from '../hooks/useProviderModelTask';
import type { ProviderModelTaskProps } from '../types';
import { ProviderModelSetupCompletion } from './ProviderModelSetupCompletion';

export function ProviderModelManualForm({
  provider,
  returnTo,
  shouldEnableProvider,
}: ProviderModelTaskProps) {
  const { t } = useTranslation();
  const {
    baseline,
    canSubmit,
    capabilities,
    primaryType,
    pricingDraft,
    pricingErrors,
    defaultName,
    fieldErrors,
    formState,
    isDirty,
    isResolving,
    isSubmitting,
    hasLookupError,
    retryLookup,
    submitAddModel,
    updateCapability,
    updateContextWindow,
    updateEndpointType,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateName,
    updateGroup,
    updatePrimaryType,
    updatePricing,
    updateSupportsStreaming,
  } = useProviderModelAdd({ provider });

  const flow = useProviderModelTask({
    provider,
    returnTo,
    shouldEnableProvider,
    hasUnsavedChanges: isDirty,
    isSaving: isSubmitting,
  });
  const [isEndpointOpen, setIsEndpointOpen] = useState(false);
  const isMetadataDisabled = isSubmitting || isResolving || hasLookupError;
  const limitFields = [
    { field: 'contextWindow', onChange: updateContextWindow },
    { field: 'maxInputTokens', onChange: updateMaxInputTokens },
    { field: 'maxOutputTokens', onChange: updateMaxOutputTokens },
  ] as const;
  const limitError = limitFields.map(({ field }) => fieldErrors[field]).find(Boolean);
  const configuredLimits = limitFields.filter(
    ({ field }) => formState[field] || baseline?.[field],
  ).length;
  const defaultGroup =
    baseline?.group ?? getDefaultProviderModelGroupName(formState.modelId, provider.id);
  const supportsStreaming = formState.supportsStreaming ?? baseline?.supportsStreaming ?? true;
  const endpointOptions = [
    { value: 'auto' as const, label: t('settings.provider.models.addEndpointAuto') },
    ...getProviderModelAddEndpointOptions(provider).map(({ id, labelKey }) => ({
      value: id,
      label: t(labelKey),
    })),
  ];
  const endpointLabel =
    formState.endpointType === 'auto'
      ? t('settings.provider.models.addEndpointAuto')
      : t(getProviderModelEndpointLabelKey(formState.endpointType));

  async function handleSubmit() {
    Keyboard.dismiss();
    if (await submitAddModel()) await flow.completeAfterSave();
  }
  const rightActions: HeaderToolbarAction[] =
    flow.hasSavedModels && shouldEnableProvider
      ? []
      : [
          {
            accessibilityLabel: t('settings.provider.models.addSubmit'),
            disabled: isSubmitting || flow.isEnabling || !canSubmit,
            key: 'add-model',
            label:
              isSubmitting || flow.isEnabling
                ? t('common.saving')
                : t('settings.provider.models.add'),
            onPress: () => void handleSubmit(),
            type: 'label',
          },
        ];
  return (
    <>
      <RouteHeader
        onBack={flow.requestClose}
        rightActions={rightActions}
        title={t('settings.provider.models.addTitle')}
      />
      <View className="flex-1">
        {flow.hasSavedModels && shouldEnableProvider ? (
          <ProviderModelSetupCompletion
            isEnabling={flow.isEnabling}
            onComplete={flow.completeFlow}
            onConfigure={flow.openConfiguration}
            onAddModel={flow.openManualAdd}
          />
        ) : (
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
            <View className="gap-4">
              <ProviderModelAddTextField
                required
                accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
                errorMessage={fieldErrors.modelId}
                isDisabled={isSubmitting}
                label={t('settings.provider.models.addModelIdLabel')}
                placeholder={t('settings.provider.models.addModelIdPlaceholder')}
                value={formState.modelId}
                onChangeText={updateModelId}
              />
              <ProviderModelAddTextField
                accessibilityLabel={t('settings.provider.models.addModelNameLabel')}
                isDisabled={isSubmitting}
                label={t('settings.provider.models.addModelNameLabel')}
                placeholder={defaultName || t('settings.provider.models.addModelNamePlaceholder')}
                value={formState.name}
                onChangeText={updateName}
              />
              {hasLookupError ? (
                <View className="items-start gap-2">
                  <Text className="text-error text-xs">
                    {t('settings.provider.models.addLookupFailed')}
                  </Text>
                  <Button size="inline" variant="ghost" onPress={() => void retryLookup()}>
                    <Button.Label>{t('common.retry')}</Button.Label>
                  </Button>
                </View>
              ) : isResolving ? (
                <Text className="text-muted-foreground text-xs">
                  {t('settings.provider.models.addResolving')}
                </Text>
              ) : null}
            </View>

            <Section>
              <ProviderModelTypeField
                value={primaryType}
                disabled={isMetadataDisabled}
                onChange={updatePrimaryType}
              />
              <Section.SelectItem
                label={t('settings.provider.models.addEndpointTypeLabel')}
                accessibilityLabel={`${t('settings.provider.models.addEndpointTypeLabel')}, ${endpointLabel}`}
                value={
                  <Text className="text-base text-foreground" numberOfLines={2}>
                    {endpointLabel}
                  </Text>
                }
                disabled={isSubmitting || endpointOptions.length === 1}
                onPress={() => {
                  Keyboard.dismiss();
                  setIsEndpointOpen(true);
                }}
              />
              {fieldErrors.endpointType ? (
                <Text className="px-4 pb-4 text-error text-sm">{fieldErrors.endpointType}</Text>
              ) : null}
            </Section>

            <ProviderModelClassificationFields
              capabilities={capabilities}
              disabled={isMetadataDisabled}
              requiresImageInput={Boolean(
                formState.endpointType === 'auto'
                  ? baseline?.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
                  : formState.endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
              )}
              supportsStreaming={supportsStreaming}
              onCapabilityChange={updateCapability}
            >
              <Section.SwitchItem
                disabled={isMetadataDisabled}
                label={t('settings.provider.models.supportsStreaming')}
                value={supportsStreaming}
                onValueChange={updateSupportsStreaming}
              />
            </ProviderModelClassificationFields>

            {!capabilities.drawing ? (
              <ProviderModelFormSection
                title={t('settings.provider.models.form.limits')}
                summary={
                  configuredLimits
                    ? t('settings.provider.models.form.limitsConfigured', {
                        value: configuredLimits,
                      })
                    : t('settings.provider.models.detail.useDefault')
                }
                errorMessage={limitError}
                disabled={isSubmitting}
              >
                <View className="gap-4 p-4">
                  {limitFields.map(({ field, onChange }) => (
                    <ProviderModelNumberField
                      key={field}
                      disabled={isSubmitting}
                      errorMessage={fieldErrors[field]}
                      label={t(`settings.provider.models.detail.${field}`)}
                      placeholder={
                        baseline?.[field]?.toString() ??
                        t('settings.provider.models.detail.useDefault')
                      }
                      value={formState[field]}
                      onChangeText={onChange}
                    />
                  ))}
                </View>
              </ProviderModelFormSection>
            ) : null}

            <ProviderModelPricingFields
              draft={pricingDraft}
              errors={pricingErrors}
              disabled={isMetadataDisabled}
              onChange={updatePricing}
            />

            <ProviderModelFormSection
              title={t('settings.provider.models.detail.group')}
              summary={
                formState.group.trim() ||
                defaultGroup ||
                t('settings.provider.models.form.optional')
              }
              disabled={isSubmitting}
            >
              <View className="p-4">
                <ProviderModelAddTextField
                  accessibilityLabel={t('settings.provider.models.detail.group')}
                  isDisabled={isSubmitting}
                  label={t('settings.provider.models.detail.group')}
                  placeholder={defaultGroup}
                  value={formState.group}
                  onChangeText={updateGroup}
                />
              </View>
            </ProviderModelFormSection>
          </KeyboardAwareScrollView>
        )}
      </View>
      {isEndpointOpen ? (
        <OptionPickerBottomSheet<ProviderModelAddEndpoint>
          open
          onClose={() => setIsEndpointOpen(false)}
          title={t('settings.provider.models.addEndpointTypeLabel')}
          options={endpointOptions}
          selectedValue={formState.endpointType}
          onValueChange={updateEndpointType}
          size="compact"
        />
      ) : null}
    </>
  );
}

function ProviderModelAddTextField({
  accessibilityLabel,
  errorMessage,
  isDisabled,
  label,
  onChangeText,
  placeholder,
  required = false,
  value,
}: {
  accessibilityLabel: string;
  errorMessage?: string;
  isDisabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  required?: boolean;
  value: string;
}) {
  return (
    <TextField disabled={isDisabled} invalid={Boolean(errorMessage)} required={required}>
      <TextField.Label>{label}</TextField.Label>
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType="done"
        value={value}
      />
      <TextField.Error>{errorMessage}</TextField.Error>
    </TextField>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 20,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
});
