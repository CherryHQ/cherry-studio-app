import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import {
  Button,
  Input,
  OptionPickerBottomSheet,
  SelectField,
  TextField,
} from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProviderBrandAvatar } from '@/frontend/components/Avatar';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { Provider } from '@/shared/data/types/provider';

import {
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  type CustomProviderTextEndpoint,
  isValidEndpointBaseUrl,
} from '../../apiService/utils/providerApiServiceEndpointRules';
import {
  ProviderForm,
  type ProviderFormValue,
  useProviderForm,
} from '../../components/ProviderForm';

export function ProviderSetupFormContent({
  children,
  canSave,
  form,
  onSave,
}: {
  children: ReactNode;
  canSave: boolean;
  form: ProviderFormValue;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2 px-4 pt-5">
          <Text className="text-xs text-muted-foreground">
            {t('onboarding.step', { current: 2 })}
          </Text>
          <Text className="text-base text-foreground">
            {t('onboarding.connection.description')}
          </Text>
        </View>
        <ProviderForm value={form}>{children}</ProviderForm>
      </ScrollView>
      <View className="gap-2 px-4 pt-3" style={{ paddingBottom: Math.max(bottom, 16) }}>
        <Button disabled={!canSave} loading={form.meta.isSubmitting} onPress={onSave} size="lg">
          {t('settings.provider.setup.next')}
        </Button>
        {!canSave && !form.meta.isSubmitting ? (
          <Text className="text-center text-xs text-muted-foreground">
            {t('onboarding.connection.requiredHint')}
          </Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

export function ProviderSetupPresetFields({
  provider,
  showApiKey,
}: {
  provider: Provider;
  showApiKey: boolean;
}) {
  const { t } = useTranslation();
  const { meta } = useProviderForm('ProviderSetupPresetFields');
  const [showsAdvanced, setShowsAdvanced] = useState(false);
  const apiKeyUrl = provider.websites?.apiKey ?? provider.websites?.official;

  return (
    <View className="gap-6">
      <View className="flex-row items-center gap-3 py-2">
        <ProviderBrandAvatar
          presetProviderId={provider.presetProviderId}
          providerId={provider.id}
          providerName={provider.name}
          size={40}
        />
        <Text className="flex-1 font-medium text-lg text-foreground">{provider.name}</Text>
      </View>
      {showApiKey ? (
        <View className="gap-2">
          <ProviderForm.ApiKey />
          {apiKeyUrl ? (
            <View className="items-start">
              <Button
                disabled={meta.isSubmitting}
                onPress={() => void openExternalUrl(apiKeyUrl)}
                size="inline"
                variant="link"
              >
                {t('onboarding.connection.getKey')}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
      <View className="gap-4">
        <View className="items-start">
          <Button
            accessibilityState={{ expanded: showsAdvanced }}
            disabled={meta.isSubmitting}
            onPress={() => setShowsAdvanced(!showsAdvanced)}
            size="inline"
            variant="ghost"
          >
            <Button.Label>{t('onboarding.connection.advanced')}</Button.Label>
            {showsAdvanced ? (
              <ChevronUpIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            )}
          </Button>
        </View>
        {showsAdvanced ? (
          <View className="gap-4">
            <ProviderForm.Name />
            <ProviderForm.BaseUrl />
          </View>
        ) : (
          <Text className="text-xs text-muted-foreground">
            {t('onboarding.connection.presetHint')}
          </Text>
        )}
      </View>
    </View>
  );
}

const ENDPOINT_LABEL_KEYS: Record<CustomProviderTextEndpoint, string> = {
  'anthropic-messages': 'settings.provider.apiService.endpointAnthropic',
  'google-generate-content': 'settings.provider.apiService.endpointGemini',
  'openai-chat-completions': 'settings.provider.apiService.endpointOpenAiChat',
  'openai-responses': 'settings.provider.apiService.endpointOpenAiResponses',
};

export function ProviderSetupCustomFields() {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderSetupCustomFields');
  const [isProtocolPickerOpen, setIsProtocolPickerOpen] = useState(false);
  const endpoint = state.defaultChatEndpoint as CustomProviderTextEndpoint;
  const baseUrl = state.endpointUrls[endpoint] ?? '';
  const isInvalid = Boolean(baseUrl.trim()) && !isValidEndpointBaseUrl(baseUrl.trim());

  return (
    <View className="gap-5">
      <ProviderForm.Name />
      <ProviderForm.ApiKey />
      <TextField disabled={meta.isSubmitting} invalid={isInvalid}>
        <TextField.Label>{t('settings.provider.apiService.baseUrl')}</TextField.Label>
        <Input
          accessibilityLabel={t('settings.provider.apiService.baseUrl')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={(value) => actions.setEndpointUrl(endpoint, value)}
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          value={baseUrl}
        />
        <TextField.Error>
          {isInvalid ? t('settings.provider.apiService.invalidBaseUrlMessage') : undefined}
        </TextField.Error>
      </TextField>
      <SelectField
        accessibilityLabel={t('onboarding.connection.protocol')}
        disabled={meta.isSubmitting}
        onPress={() => setIsProtocolPickerOpen(true)}
      >
        <SelectField.Label>{t('onboarding.connection.protocol')}</SelectField.Label>
        <SelectField.Value>
          <SelectField.ValueText>{t(ENDPOINT_LABEL_KEYS[endpoint])}</SelectField.ValueText>
        </SelectField.Value>
      </SelectField>
      <OptionPickerBottomSheet
        onClose={() => setIsProtocolPickerOpen(false)}
        onValueChange={(value) => {
          const nextEndpoint = value as CustomProviderTextEndpoint;
          if (!state.endpointUrls[nextEndpoint]) actions.setEndpointUrl(nextEndpoint, baseUrl);
          actions.setDefaultChatEndpoint(nextEndpoint);
        }}
        open={isProtocolPickerOpen}
        options={CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.map((value) => ({
          label: t(ENDPOINT_LABEL_KEYS[value]),
          value,
        }))}
        selectedValue={endpoint}
        size="compact"
        title={t('onboarding.connection.protocol')}
      />
    </View>
  );
}
