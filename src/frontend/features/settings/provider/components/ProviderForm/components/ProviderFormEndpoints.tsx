import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronUpIcon from '@cherrystudio/app-icons/icons/chevron-up';
import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { CHAT_ENDPOINT_TYPES } from '@/shared/utils/providerEndpoints';

import {
  type CustomProviderTextEndpoint,
  getConfiguredCustomProviderTextEndpoints,
  hasConfiguredCustomProviderTextEndpoint,
  isValidEndpointBaseUrl,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
import { useProviderForm } from '../context';
import { ProviderFormEndpoint } from './ProviderFormEndpoint';

const COMMON_TEXT_ENDPOINTS = CHAT_ENDPOINT_TYPES.slice(0, 2);
const ADVANCED_TEXT_ENDPOINTS = CHAT_ENDPOINT_TYPES.slice(2);

const endpointLabelKeys = {
  'anthropic-messages': 'settings.provider.apiService.endpointAnthropic',
  'google-generate-content': 'settings.provider.apiService.endpointGemini',
  'openai-chat-completions': 'settings.provider.apiService.endpointOpenAiChat',
  'openai-responses': 'settings.provider.apiService.endpointOpenAiResponses',
} as const satisfies Record<CustomProviderTextEndpoint, string>;

/** The single primary URL used by preset and IAM-backed provider forms. */
export function ProviderFormBaseUrl() {
  const { meta } = useProviderForm('ProviderForm.BaseUrl');

  if (!meta.baseUrlEndpoint) {
    return null;
  }

  return <ProviderFormEndpoint endpoint={meta.baseUrlEndpoint} />;
}

ProviderFormBaseUrl.displayName = 'ProviderForm.BaseUrl';

/** Four configurable chat endpoints for a fully custom provider. */
export function ProviderFormTextEndpoints() {
  const { t } = useTranslation();
  const { meta, state } = useProviderForm('ProviderForm.Endpoints');
  const [showsAdvancedEndpoints, setShowsAdvancedEndpoints] = useState(() =>
    ADVANCED_TEXT_ENDPOINTS.some((endpointType) =>
      Boolean(state.endpointUrls[endpointType]?.trim()),
    ),
  );
  const configuredEndpoints = getConfiguredCustomProviderTextEndpoints(state.endpointUrls);
  const configuredAdvancedCount = ADVANCED_TEXT_ENDPOINTS.filter((endpointType) =>
    Boolean(state.endpointUrls[endpointType]?.trim()),
  ).length;
  const defaultEndpointLabel = t(
    endpointLabelKeys[state.defaultChatEndpoint as CustomProviderTextEndpoint],
  );
  const hasConfiguredEndpoint = hasConfiguredCustomProviderTextEndpoint(state.endpointUrls);

  return (
    <View className="gap-3">
      <Text className="font-medium text-base text-foreground">
        {t('settings.provider.apiService.textEndpointsTitle')}
      </Text>

      {COMMON_TEXT_ENDPOINTS.map((endpointType) => (
        <ProviderFormTextEndpointField endpoint={endpointType} key={endpointType} />
      ))}

      <View className="items-start">
        <Button
          accessibilityLabel={t('settings.provider.apiService.moreEndpoints')}
          accessibilityState={{ expanded: showsAdvancedEndpoints }}
          disabled={meta.isSubmitting}
          hitSlop={8}
          onPress={() => setShowsAdvancedEndpoints((current) => !current)}
          size="inline"
          variant="ghost"
        >
          <Button.Label numberOfLines={1}>
            {configuredAdvancedCount > 0
              ? t('settings.provider.apiService.moreEndpointsConfigured', {
                  count: configuredAdvancedCount,
                })
              : t('settings.provider.apiService.moreEndpoints')}
          </Button.Label>
          {showsAdvancedEndpoints ? (
            <ChevronUpIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          )}
        </Button>
      </View>

      {showsAdvancedEndpoints
        ? ADVANCED_TEXT_ENDPOINTS.map((endpointType) => (
            <ProviderFormTextEndpointField endpoint={endpointType} key={endpointType} />
          ))
        : null}

      {meta.defaultEndpointNeedsRepair && configuredEndpoints.length > 0 ? (
        <Text className="text-warning text-xs">
          {t('settings.provider.apiService.defaultEndpointRepair', {
            endpoint: defaultEndpointLabel,
          })}
        </Text>
      ) : null}
      {meta.hasEditedEndpointUrls && !hasConfiguredEndpoint ? (
        <Text className="text-error text-xs">
          {t('settings.provider.apiService.textEndpointRequired')}
        </Text>
      ) : null}
    </View>
  );
}

ProviderFormTextEndpoints.displayName = 'ProviderForm.Endpoints';

function ProviderFormTextEndpointField({ endpoint }: { endpoint: CustomProviderTextEndpoint }) {
  const { t } = useTranslation();
  const { actions, meta, state } = useProviderForm('ProviderForm.Endpoints');
  const label = t(endpointLabelKeys[endpoint]);
  const trimmedValue = state.endpointUrls[endpoint]?.trim() ?? '';
  const isInvalid = trimmedValue.length > 0 && !isValidEndpointBaseUrl(trimmedValue);
  const isDefault = endpoint === state.defaultChatEndpoint && trimmedValue.length > 0;

  return (
    <ProviderFormEndpoint endpoint={endpoint} label={label}>
      {isDefault ? (
        <Text className="font-medium text-muted-foreground text-xs">
          {t('settings.provider.apiService.defaultEndpoint')}
        </Text>
      ) : trimmedValue ? (
        <Button
          accessibilityLabel={t('settings.provider.apiService.setDefaultEndpointAccessibility', {
            endpoint: label,
          })}
          disabled={meta.isSubmitting || isInvalid}
          onPress={() => actions.setDefaultChatEndpoint(endpoint)}
          size="inline"
          variant="link"
        >
          {t('settings.provider.apiService.setDefaultEndpoint')}
        </Button>
      ) : null}
    </ProviderFormEndpoint>
  );
}
