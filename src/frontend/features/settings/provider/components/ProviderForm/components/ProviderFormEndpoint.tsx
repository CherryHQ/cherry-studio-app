import {
  getProviderBaseUrlIssue,
  isWithTrailingSharp,
  shouldAppendProviderApiVersion,
} from '@cherrystudio/ai-runtime/provider';
import { Button, Input, Section, TextField } from '@cherrystudio/ui/components';
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
  const rawValue = state.endpointUrls[endpoint] ?? '';
  const value = rawValue.replace(/#\s*$/, '');
  const issue = value.trim() ? getProviderBaseUrlIssue(rawValue) : null;
  const fieldLabel = label ?? t('settings.provider.apiService.baseUrl');
  const appendsVersion = !isWithTrailingSharp(rawValue);
  const requestUrl = isCustomProviderTextEndpointType(endpoint)
    ? getCustomProviderEndpointRequestPreview(endpoint, rawValue, meta.provider)
    : null;
  const apiVersion = endpoint === 'google-generate-content' ? '/v1beta' : '/v1';
  const canChooseVersion =
    requestUrl !== null &&
    endpoint !== 'anthropic-messages' &&
    shouldAppendProviderApiVersion(meta.provider);

  function changeUrl(next: string) {
    if (!next.trim().replace(/#$/, '').trim()) {
      actions.setEndpointUrl(endpoint, '');
      return;
    }
    const nextValue = appendsVersion || isWithTrailingSharp(next) ? next : `${next.trimEnd()}#`;
    actions.setEndpointUrl(endpoint, nextValue);
  }

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
          onChangeText={changeUrl}
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
      {canChooseVersion ? (
        <Section variant="plain">
          <Section.SwitchItem
            density="compact"
            disabled={meta.isSubmitting}
            label={t('settings.provider.apiService.appendApiVersion', { version: apiVersion })}
            onValueChange={(next) =>
              actions.setEndpointUrl(endpoint, `${value.trim()}${next ? '' : '#'}`)
            }
            value={appendsVersion}
          />
        </Section>
      ) : null}
      {requestUrl ? <ProviderRequestUrl disabled={meta.isSubmitting} url={requestUrl} /> : null}
    </View>
  );
}
