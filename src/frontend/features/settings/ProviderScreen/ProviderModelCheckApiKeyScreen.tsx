import { CheckIcon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { useProviderApiServiceQueries } from './apiService';
import { useProviderModelCheckApiKeyOptions } from './models/hooks/useProviderModelCheckApiKeyOptions';
import { resolveProviderModelCheckApiKey } from './models/utils/providerModelCheckSelection';

/**
 * The key a connectivity check runs with, picked on the same kind of pushed
 * screen the model is. Like the model, it is carried back to the detail screen
 * as a route param rather than written anywhere.
 */
export default function ProviderModelCheckApiKeyScreen() {
  const { checkApiKeyId, checkModelId, providerId, providerName } = useLocalSearchParams<{
    checkApiKeyId?: string;
    checkModelId?: string;
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { apiKeys } = useProviderApiServiceQueries(providerId ?? '');
  const options = useProviderModelCheckApiKeyOptions(apiKeys);
  const selectedValue = resolveProviderModelCheckApiKey(options, checkApiKeyId)?.value ?? null;
  const handleSelect = useCallback(
    (value: string) => {
      if (!providerId) {
        return;
      }

      router.dismissTo({
        params: {
          checkApiKeyId: value,
          ...(checkModelId ? { checkModelId } : {}),
          providerId,
          ...(providerName ? { providerName } : {}),
        },
        pathname: '/settings/provider/[providerId]',
      });
    },
    [checkModelId, providerId, providerName, router],
  );

  if (!providerId) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <>
      <BackHeader title={t('settings.provider.models.checkApiKeySection')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Section>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;

            return (
              <Section.Item
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                key={option.value}
                label={option.label}
                onPress={() => handleSelect(option.value)}
                showChevron={false}
                trailing={isSelected ? <CheckIcon className="size-5 text-foreground" /> : null}
              />
            );
          })}
        </Section>
      </ScrollView>
    </>
  );
}
