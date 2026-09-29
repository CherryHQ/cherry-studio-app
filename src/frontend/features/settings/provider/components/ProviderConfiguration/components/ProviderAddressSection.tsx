import { getProviderBaseUrlIssue } from '@cherrystudio/ai-runtime/provider';
import { Chip, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { EndpointType } from '@/shared/data/types/model';
import { CHAT_ENDPOINT_TYPES } from '@/shared/utils/providerEndpoints';

import {
  type CustomProviderTextEndpoint,
  getCustomProviderEndpointRequestPreview,
  isCustomProviderTextEndpointType,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import { getProviderModelEndpointLabelKey } from '../../../models/utils/providerModelAdd';
import { ProviderRequestUrl } from '../../ProviderRequestUrl';
import type { ProviderAddress, ProviderConfigurationValue } from '../types';
import { ProviderValueSheet } from './ProviderValueSheet';

// The two protocols most custom services speak; the rest stay behind "More protocols".
const COMMON_TEXT_ENDPOINTS = CHAT_ENDPOINT_TYPES.slice(0, 2);
const ADVANCED_TEXT_ENDPOINTS = CHAT_ENDPOINT_TYPES.slice(2);

const CUSTOM_ENDPOINT_LABEL_KEYS = {
  'anthropic-messages': 'settings.provider.apiService.endpointAnthropic',
  'google-generate-content': 'settings.provider.apiService.endpointGemini',
  'openai-chat-completions': 'settings.provider.apiService.endpointOpenAiChat',
  'openai-responses': 'settings.provider.apiService.endpointOpenAiResponses',
} as const satisfies Record<CustomProviderTextEndpoint, string>;

type AddressEdit = { endpoint: EndpointType; open: boolean; text: string; title: string };

/** Shows an address by its host, the part a person recognizes. */
function displayHost(url: string): string {
  const trimmed = url.trim();
  return trimmed.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
}

/**
 * Where requests go. A preset keeps this under "Advanced": its address is already right
 * for almost everyone. A custom provider lists an address per protocol and its default.
 */
export function ProviderAddressSection({ value }: { value: ProviderConfigurationValue }) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState<AddressEdit | null>(null);
  const [showsAllProtocols, setShowsAllProtocols] = useState(false);
  const { address } = value;
  if (address.kind === 'none') return null;

  const issue = edit?.text.trim() ? getProviderBaseUrlIssue(edit.text) : null;
  const closeEdit = () => setEdit((current) => current && { ...current, open: false });
  const submitEdit = () => {
    if (!edit || issue) return;
    void (address.kind === 'primary'
      ? value.actions.setBaseUrl(edit.text.trim())
      : value.actions.setEndpointUrl(edit.endpoint, edit.text.trim()));
    closeEdit();
  };
  const requestPreview =
    edit && !issue && edit.text.trim() && isCustomProviderTextEndpointType(edit.endpoint)
      ? getCustomProviderEndpointRequestPreview(edit.endpoint, edit.text.trim(), value.provider)
      : null;
  const sheet = edit ? (
    <ProviderValueSheet
      description={t('settings.provider.apiService.baseUrlHelp')}
      error={
        issue
          ? t(
              issue.code === 'endpoint-path'
                ? 'settings.provider.apiService.fullEndpointUrl'
                : 'settings.provider.apiService.invalidBaseUrlMessage',
            )
          : undefined
      }
      keyboardType="url"
      label={t('settings.provider.config.apiAddress')}
      onChangeText={(text) => setEdit((current) => current && { ...current, text })}
      onClose={closeEdit}
      onSubmit={submitEdit}
      open={edit.open}
      placeholder={t('settings.provider.apiService.baseUrlPlaceholder')}
      secondaryAction={
        issue?.code === 'endpoint-path'
          ? {
              label: t('settings.provider.apiService.useBaseUrl'),
              onPress: () =>
                setEdit((current) => current && { ...current, text: issue.suggestedBaseUrl }),
            }
          : address.kind === 'custom' &&
              edit.endpoint !== address.defaultChatEndpoint &&
              address.endpointUrls[edit.endpoint]?.trim()
            ? {
                label: t('settings.provider.apiService.setDefaultEndpoint'),
                onPress: () => {
                  void value.actions.setDefaultEndpoint(edit.endpoint);
                  closeEdit();
                },
              }
            : undefined
      }
      submitDisabled={Boolean(issue)}
      testID="provider-address-sheet"
      title={edit.title}
      value={edit.text}
    >
      {requestPreview ? (
        <ProviderRequestUrl url={requestPreview.replace('{model}', '<model>')} />
      ) : null}
    </ProviderValueSheet>
  ) : null;

  if (address.kind === 'primary') {
    const protocol = t(getProviderModelEndpointLabelKey(address.endpoint));
    return (
      <>
        <Section title={t('settings.provider.config.advanced')}>
          <Section.Item
            label={t('settings.provider.config.apiAddress')}
            onPress={() =>
              setEdit({
                endpoint: address.endpoint,
                open: true,
                text: address.baseUrl,
                title: t('settings.provider.config.apiAddress'),
              })
            }
            testID="provider-base-url"
            trailing={<AddressValue text={displayHost(address.baseUrl)} />}
            showChevron
          />
          <Section.Item
            label={t('onboarding.connection.protocol')}
            trailing={<AddressValue text={protocol} />}
          />
        </Section>
        {sheet}
      </>
    );
  }

  return (
    <>
      <CustomAddressRows
        address={address}
        onEdit={(endpoint, title) =>
          setEdit({ endpoint, open: true, text: address.endpointUrls[endpoint] ?? '', title })
        }
        onToggleProtocols={() => setShowsAllProtocols((current) => !current)}
        showsAllProtocols={showsAllProtocols}
      />
      {sheet}
    </>
  );
}

function CustomAddressRows({
  address,
  onEdit,
  onToggleProtocols,
  showsAllProtocols,
}: {
  address: Extract<ProviderAddress, { kind: 'custom' }>;
  onEdit: (endpoint: EndpointType, title: string) => void;
  onToggleProtocols: () => void;
  showsAllProtocols: boolean;
}) {
  const { t } = useTranslation();
  const configuredAdvanced = ADVANCED_TEXT_ENDPOINTS.filter((endpoint) =>
    address.endpointUrls[endpoint]?.trim(),
  );
  const endpoints = showsAllProtocols
    ? CHAT_ENDPOINT_TYPES
    : [...COMMON_TEXT_ENDPOINTS, ...configuredAdvanced];
  const hiddenCount = CHAT_ENDPOINT_TYPES.length - endpoints.length;

  return (
    <Section
      footer={t('settings.provider.apiService.baseUrlHelp')}
      title={t('settings.provider.config.apiAddress')}
    >
      {endpoints.map((endpoint) => {
        const label = t(CUSTOM_ENDPOINT_LABEL_KEYS[endpoint as CustomProviderTextEndpoint]);
        const url = address.endpointUrls[endpoint]?.trim() ?? '';
        return (
          <Section.Item
            accessibilityLabel={label}
            key={endpoint}
            label={
              <View className="flex-row items-center gap-2">
                <Text className="shrink text-base text-foreground">{label}</Text>
                {url && endpoint === address.defaultChatEndpoint ? (
                  <Chip.Tag className="px-2 py-0.5">
                    <Chip.Label className="text-xs">
                      {t('settings.provider.apiService.defaultEndpoint')}
                    </Chip.Label>
                  </Chip.Tag>
                ) : null}
              </View>
            }
            // The address sits under its protocol so neither has to be cut short.
            description={url ? displayHost(url) : t('settings.provider.config.notSet')}
            onPress={() => onEdit(endpoint, label)}
            testID={`provider-endpoint-${endpoint}`}
          />
        );
      })}
      {hiddenCount > 0 || showsAllProtocols ? (
        <Section.Item
          label={
            showsAllProtocols
              ? t('settings.provider.config.fewerProtocols')
              : t('settings.provider.config.moreProtocols')
          }
          onPress={onToggleProtocols}
          showChevron={false}
        />
      ) : null}
    </Section>
  );
}

function AddressValue({ text }: { text: string }) {
  return (
    <Text className="min-w-0 shrink text-right text-base text-muted-foreground" numberOfLines={1}>
      {text}
    </Text>
  );
}
