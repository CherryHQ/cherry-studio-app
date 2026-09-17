import { getProviderBaseUrlIssue } from '@cherrystudio/ai-runtime/provider';
import { Button, Input, TextField } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { EndpointType } from '@/shared/data/types/model';

import {
  getCustomProviderEndpointRequestPreview,
  isCustomProviderTextEndpointType,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import { getProviderModelEndpointLabelKey } from '../../../models/utils/providerModelAdd';
import { ProviderRequestUrl } from '../../ProviderRequestUrl';
import { useProviderForm } from '../context';

export function ProviderFormEndpoint({
  endpoint,
  label,
  children,
}: {
  endpoint: EndpointType;
  label?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.Endpoint');
  const value = state.endpointUrls[endpoint] ?? '';
  const issue = value.trim() ? getProviderBaseUrlIssue(value) : null;
  const fieldLabel = label ?? t('settings.provider.apiService.baseUrl');
  const requestUrl = isCustomProviderTextEndpointType(endpoint)
    ? getCustomProviderEndpointRequestPreview(endpoint, value, meta.provider)
    : null;

  return (
    <View className="gap-2">
      <TextField disabled={meta.isSubmitting} invalid={Boolean(issue)}>
        <View className="min-h-7 flex-row items-center justify-between gap-3">
          <TextField.Label>{fieldLabel}</TextField.Label>
          {children}
        </View>
        {!label ? (
          <TextField.Description>
            {t('settings.provider.apiService.protocol', {
              protocol: t(getProviderModelEndpointLabelKey(endpoint)),
            })}
          </TextField.Description>
        ) : null}
        <Input
          accessibilityLabel={fieldLabel}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={(next) => actions.setEndpointUrl(endpoint, next)}
          placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
          testID={label ? `provider-endpoint-${endpoint}-input` : 'provider-base-url-input'}
          value={value}
        />
        {!value.trim() ? (
          <TextField.Description>
            {t('settings.provider.apiService.baseUrlHelp')}
          </TextField.Description>
        ) : null}
        <TextField.Error>
          {issue
            ? t(
                issue.code === 'endpoint-path'
                  ? 'settings.provider.apiService.fullEndpointUrl'
                  : 'settings.provider.apiService.invalidBaseUrlMessage',
              )
            : undefined}
        </TextField.Error>
      </TextField>
      {issue?.code === 'endpoint-path' ? (
        <View className="items-start">
          <Button
            disabled={meta.isSubmitting}
            onPress={() => actions.setEndpointUrl(endpoint, issue.suggestedBaseUrl)}
            size="inline"
            variant="link"
          >
            {t('settings.provider.apiService.useBaseUrl')}
          </Button>
        </View>
      ) : null}
      {requestUrl ? <ProviderRequestUrl disabled={meta.isSubmitting} url={requestUrl} /> : null}
    </View>
  );
}
