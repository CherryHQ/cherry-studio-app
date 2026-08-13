import { ChevronDownIcon, ChevronUpIcon } from '@cherrystudio/app-icons';
import { FieldError, Input, Label, TextField } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, type TextInputProps, View } from 'react-native';

import {
  getProviderModelEndpointLabelKey,
  providerModelAddEndpointOptions,
  PROVIDER_MODEL_PURPOSE_OPTIONS,
  type ProviderModelAddFormState,
  type ProviderModelAddMode,
  type ProviderModelChatEndpointType,
  type ProviderModelPurpose,
} from '../utils/providerModelAdd';

export type ProviderModelDraftFormController = {
  chatEndpointTypes: ProviderModelChatEndpointType[];
  endpointTypeError?: string;
  formState: ProviderModelAddFormState;
  modelAddMode: ProviderModelAddMode;
  modelIdError?: string;
  modelPurpose: ProviderModelPurpose;
  updateChatEndpointType: (endpointType: ProviderModelChatEndpointType) => void;
  updateContextWindow: (value: string) => void;
  updateEndpointTypes: (endpointTypes: EndpointType[]) => void;
  updateGroup: (value: string) => void;
  updateMaxInputTokens: (value: string) => void;
  updateMaxOutputTokens: (value: string) => void;
  updateModelId: (value: string) => void;
  updateModelPurpose: (purpose: ProviderModelPurpose) => void;
  updateName: (value: string) => void;
};

export function ProviderModelDraftForm({
  controller,
  isDisabled = false,
  onAdvancedFieldFocus,
  onAdvancedSettingsLayout,
  onMoreSettingsVisibilityChange,
  showMoreSettings,
}: {
  controller: ProviderModelDraftFormController;
  isDisabled?: boolean;
  onAdvancedFieldFocus?: TextInputProps['onFocus'];
  onAdvancedSettingsLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
  onMoreSettingsVisibilityChange: (visible: boolean) => void;
  showMoreSettings: boolean;
}) {
  const { t } = useTranslation();
  const {
    chatEndpointTypes,
    endpointTypeError,
    formState,
    modelAddMode,
    modelIdError,
    modelPurpose,
    updateChatEndpointType,
    updateContextWindow,
    updateEndpointTypes,
    updateGroup,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateModelPurpose,
    updateName,
  } = controller;
  const selectedEndpointTypes = useMemo(
    () => new Set(formState.endpointTypes),
    [formState.endpointTypes],
  );
  const toggleEndpointType = useCallback(
    (endpointType: EndpointType) => {
      const currentTypes = new Set(selectedEndpointTypes);
      if (currentTypes.has(endpointType)) currentTypes.delete(endpointType);
      else currentTypes.add(endpointType);
      updateEndpointTypes([...currentTypes]);
    },
    [selectedEndpointTypes, updateEndpointTypes],
  );

  return (
    <View className="gap-4">
      <ProviderModelDraftTextField
        accessibilityLabel={t('settings.provider.models.addModelIdLabel')}
        errorMessage={modelIdError}
        isDisabled={isDisabled}
        label={t('settings.provider.models.addModelIdLabel')}
        placeholder={t('settings.provider.models.addModelIdPlaceholder')}
        value={formState.modelId}
        onChangeText={updateModelId}
      />

      <ProviderModelDraftTextField
        accessibilityLabel={t('settings.provider.models.addModelNameLabel')}
        isDisabled={isDisabled}
        label={t('settings.provider.models.addModelNameLabel')}
        placeholder={t('settings.provider.models.addModelNamePlaceholder')}
        value={formState.name}
        onChangeText={updateName}
      />

      <ProviderModelDraftTextField
        accessibilityLabel={t('settings.provider.models.addGroupNameLabel')}
        isDisabled={isDisabled}
        label={t('settings.provider.models.addGroupNameLabel')}
        placeholder={t('settings.provider.models.addGroupNamePlaceholder')}
        value={formState.group}
        onChangeText={updateGroup}
      />

      {modelAddMode === 'endpoint-types' ? (
        <View className="gap-2">
          <Text className="font-medium text-foreground text-sm">
            {t('settings.provider.models.addEndpointTypeLabel')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {providerModelAddEndpointOptions.map((option) => (
              <EndpointTypeChip
                key={option.id}
                isDisabled={isDisabled}
                isSelected={selectedEndpointTypes.has(option.id)}
                label={t(option.labelKey)}
                onPress={() => toggleEndpointType(option.id)}
                selectionRole="checkbox"
              />
            ))}
          </View>
          {endpointTypeError ? (
            <Text className="text-destructive text-xs">{endpointTypeError}</Text>
          ) : null}
        </View>
      ) : null}

      {modelAddMode === 'purpose' ? (
        <View className="gap-2">
          <Text className="font-medium text-foreground text-sm">
            {t('settings.provider.models.addPurposeLabel')}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {t('settings.provider.models.addPurposeDescription')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PROVIDER_MODEL_PURPOSE_OPTIONS.map((option) => (
              <EndpointTypeChip
                key={option.id}
                isDisabled={isDisabled}
                isSelected={modelPurpose === option.id}
                label={t(option.labelKey)}
                onPress={() => updateModelPurpose(option.id)}
                selectionRole="radio"
              />
            ))}
          </View>

          {modelPurpose === 'chat' && chatEndpointTypes.length > 1 ? (
            <View className="mt-2 gap-2">
              <Text className="font-medium text-foreground text-sm">
                {t('settings.provider.models.addChatEndpointLabel')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {chatEndpointTypes.map((endpointType) => (
                  <EndpointTypeChip
                    key={endpointType}
                    isDisabled={isDisabled}
                    isSelected={formState.endpointTypes[0] === endpointType}
                    label={t(getProviderModelEndpointLabelKey(endpointType))}
                    onPress={() => updateChatEndpointType(endpointType)}
                    selectionRole="radio"
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={t('settings.provider.models.addMoreSettings')}
        accessibilityRole="button"
        className="h-10 flex-row items-center justify-center gap-2 rounded-xl bg-secondary px-3 active:opacity-70 disabled:opacity-40"
        disabled={isDisabled}
        onPress={() => onMoreSettingsVisibilityChange(!showMoreSettings)}
      >
        <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
          {t('settings.provider.models.addMoreSettings')}
        </Text>
        {showMoreSettings ? (
          <ChevronUpIcon className="size-4 text-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-foreground" />
        )}
      </Pressable>

      {showMoreSettings ? (
        <View className="gap-3" onLayout={onAdvancedSettingsLayout}>
          <ProviderModelDraftNumberField
            accessibilityLabel={t('settings.provider.models.addContextWindowLabel')}
            isDisabled={isDisabled}
            label={t('settings.provider.models.addContextWindowLabel')}
            placeholder={t('settings.provider.models.addContextWindowPlaceholder')}
            value={formState.contextWindow}
            onChangeText={updateContextWindow}
            onFocus={onAdvancedFieldFocus}
          />
          <ProviderModelDraftNumberField
            accessibilityLabel={t('settings.provider.models.addMaxInputTokensLabel')}
            isDisabled={isDisabled}
            label={t('settings.provider.models.addMaxInputTokensLabel')}
            placeholder={t('settings.provider.models.addMaxInputTokensPlaceholder')}
            value={formState.maxInputTokens}
            onChangeText={updateMaxInputTokens}
            onFocus={onAdvancedFieldFocus}
          />
          <ProviderModelDraftNumberField
            accessibilityLabel={t('settings.provider.models.addMaxOutputTokensLabel')}
            isDisabled={isDisabled}
            label={t('settings.provider.models.addMaxOutputTokensLabel')}
            placeholder={t('settings.provider.models.addMaxOutputTokensPlaceholder')}
            value={formState.maxOutputTokens}
            onChangeText={updateMaxOutputTokens}
            onFocus={onAdvancedFieldFocus}
          />
        </View>
      ) : null}
    </View>
  );
}

function ProviderModelDraftTextField({
  accessibilityLabel,
  errorMessage,
  isDisabled,
  label,
  onChangeText,
  onFocus,
  placeholder,
  textInputProps,
  value,
}: {
  accessibilityLabel: string;
  errorMessage?: string;
  isDisabled: boolean;
  label: string;
  onChangeText: (value: string) => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  textInputProps?: Pick<TextInputProps, 'inputMode' | 'keyboardType'>;
  value: string;
}) {
  return (
    <TextField isDisabled={isDisabled} isInvalid={Boolean(errorMessage)}>
      <Label>{label}</Label>
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="done"
        value={value}
        {...textInputProps}
      />
      <FieldError>{errorMessage}</FieldError>
    </TextField>
  );
}

function ProviderModelDraftNumberField({
  onChangeText,
  ...props
}: Omit<React.ComponentProps<typeof ProviderModelDraftTextField>, 'onChangeText'> & {
  onChangeText: (value: string) => void;
}) {
  const handleChangeText = useCallback(
    (nextValue: string) => onChangeText(nextValue.replaceAll(/\D/g, '')),
    [onChangeText],
  );
  return (
    <ProviderModelDraftTextField
      {...props}
      onChangeText={handleChangeText}
      textInputProps={{ inputMode: 'numeric', keyboardType: 'number-pad' }}
    />
  );
}

function EndpointTypeChip({
  isDisabled,
  isSelected,
  label,
  onPress,
  selectionRole,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  label: string;
  onPress: () => void;
  selectionRole: 'checkbox' | 'radio';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={selectionRole}
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      className={cn(
        'h-8 flex-row items-center gap-1 rounded-full px-3 active:opacity-70 disabled:opacity-40',
        isSelected ? 'bg-primary/10' : 'border border-border bg-secondary',
      )}
      disabled={isDisabled}
      onPress={onPress}
    >
      <Text
        className={cn('font-medium text-sm', isSelected ? 'text-primary' : 'text-foreground')}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
