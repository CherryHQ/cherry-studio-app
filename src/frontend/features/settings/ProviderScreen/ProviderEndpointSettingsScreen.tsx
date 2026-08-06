import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { EndpointConfigs, Provider } from '@cherrystudio/universal/data/types/provider';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import {
  buildProviderApiServiceEndpointUpdates,
  canEditProviderEndpoint,
  type EndpointDraft,
  getProviderApiServiceEndpointDirtyState,
  ProviderApiServiceEndpointForm,
  ProviderApiServiceSaveError,
  useProviderApiServiceEndpointDraft,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from './apiService';

export default function ProviderEndpointSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const { provider, providerQuery, saveProviderMutation } = useProviderApiServiceQueries(
    providerId ?? '',
  );
  const saveEndpointConfigs = useCallback(
    (updates: { defaultChatEndpoint: EndpointType; endpointConfigs: EndpointConfigs }) =>
      saveProviderMutation.mutateAsync(updates),
    [saveProviderMutation],
  );

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  if (provider && !canEditProviderEndpoint(provider)) {
    return (
      <Redirect
        href={{
          params: {
            ...(providerName || provider.name
              ? { providerName: providerName ?? provider.name }
              : {}),
            providerId,
          },
          pathname: '/settings/provider/[providerId]',
        }}
      />
    );
  }

  if (!provider) {
    return <BackHeader title={t('settings.provider.apiService.manageEndpoints')} />;
  }

  return <ProviderEndpointSettingsForm onSave={saveEndpointConfigs} provider={provider} />;
}

function ProviderEndpointSettingsForm({
  onSave,
  provider,
}: {
  onSave: (updates: {
    defaultChatEndpoint: EndpointType;
    endpointConfigs: EndpointConfigs;
  }) => Promise<unknown>;
  provider: Provider;
}) {
  const { t } = useTranslation();
  const [endpointErrors, setEndpointErrors] = useState<Partial<Record<EndpointType, string>>>({});
  const [pendingEndpoint, setPendingEndpoint] = useState<EndpointType | null>(null);
  const pendingEndpointRef = useRef<EndpointType | null>(null);
  const { draft, updateBaseUrl } = useProviderApiServiceEndpointDraft(provider);
  const hasUnsavedChanges =
    Object.keys(endpointErrors).length > 0 ||
    getProviderApiServiceEndpointDirtyState({ draft, provider });
  const isSaving = pendingEndpoint !== null;
  const { requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges,
    isSaving,
  });

  const getEndpointSaveError = useCallback(
    (error: unknown) => {
      if (error instanceof ProviderApiServiceSaveError && error.code === 'invalid-base-url') {
        return t('settings.provider.apiService.invalidBaseUrlMessage');
      }

      return t('settings.provider.apiService.saveFailed');
    },
    [t],
  );

  const saveEndpointDraft = useCallback(
    async ({
      endpoint,
      nextDraft,
    }: {
      endpoint: EndpointType;
      nextDraft: EndpointDraft;
    }): Promise<boolean> => {
      if (pendingEndpointRef.current !== null) {
        return false;
      }

      pendingEndpointRef.current = endpoint;
      setPendingEndpoint(endpoint);

      try {
        await onSave(buildProviderApiServiceEndpointUpdates({ draft: nextDraft, provider }));
        setEndpointErrors((current) => removeEndpointError(current, endpoint));
        return true;
      } catch (error) {
        setEndpointErrors((current) => ({
          ...current,
          [endpoint]: getEndpointSaveError(error),
        }));
        return false;
      } finally {
        pendingEndpointRef.current = null;
        setPendingEndpoint(null);
      }
    },
    [getEndpointSaveError, onSave, provider],
  );

  const handleBaseUrlChange = useCallback(
    (endpoint: EndpointType, value: string) => {
      updateBaseUrl(endpoint, value);
      setEndpointErrors((current) => removeEndpointError(current, endpoint));
    },
    [updateBaseUrl],
  );

  const handleBaseUrlCommit = useCallback(
    (endpoint: EndpointType, value: string) => {
      const nextDraft = {
        ...draft,
        baseUrlByEndpoint: {
          ...draft.baseUrlByEndpoint,
          [endpoint]: value,
        },
      };

      updateBaseUrl(endpoint, value);

      void saveEndpointDraft({ endpoint, nextDraft });
    },
    [draft, saveEndpointDraft, updateBaseUrl],
  );

  return (
    <>
      <BackHeader title={t('settings.provider.apiService.manageEndpoints')} onBack={requestClose} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="flex-grow"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <ProviderApiServiceEndpointForm
            baseUrlByEndpoint={draft.baseUrlByEndpoint}
            endpointErrors={endpointErrors}
            endpointTypes={draft.visibleEndpointTypes}
            pendingEndpoint={pendingEndpoint}
            onBaseUrlChange={handleBaseUrlChange}
            onBaseUrlCommit={handleBaseUrlCommit}
          />
        </View>
      </ScrollView>
    </>
  );
}

function removeEndpointError(
  errors: Partial<Record<EndpointType, string>>,
  endpoint: EndpointType,
): Partial<Record<EndpointType, string>> {
  if (!errors[endpoint]) {
    return errors;
  }

  const { [endpoint]: _removedError, ...nextErrors } = errors;
  return nextErrors;
}
