import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import type { EndpointType } from '@cherrystudio/shared/data/types/model';
import type { EndpointConfigs, Provider } from '@cherrystudio/shared/data/types/provider';
import {
  buildAddableEndpointOptions,
  buildProviderApiServiceEndpointUpdates,
  canEditProviderEndpoint,
  type EndpointDraft,
  getEndpointLabel,
  getProviderApiServiceEndpointDirtyState,
  ProviderApiServiceEndpointForm,
  ProviderApiServiceSaveError,
  useProviderApiServiceConfirmDialog,
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
  const { addEndpoint, draft, removeEndpoint, updateBaseUrl, updatePrimaryEndpoint } =
    useProviderApiServiceEndpointDraft(provider);
  const hasUnsavedChanges =
    Object.keys(endpointErrors).length > 0 ||
    getProviderApiServiceEndpointDirtyState({ draft, provider });
  const isSaving = pendingEndpoint !== null;
  const { confirmDialog, requestConfirm } = useProviderApiServiceConfirmDialog();
  const { discardDialog, requestClose } = useProviderApiServiceSheetClose({
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
        visibleEndpointTypes:
          value.trim() || endpoint === draft.primaryEndpoint
            ? draft.visibleEndpointTypes
            : draft.visibleEndpointTypes.filter((item) => item !== endpoint),
      };

      updateBaseUrl(endpoint, value);

      void (async () => {
        const didSave = await saveEndpointDraft({ endpoint, nextDraft });

        if (didSave && !value.trim() && endpoint !== draft.primaryEndpoint) {
          removeEndpoint(endpoint);
        }
      })();
    },
    [draft, removeEndpoint, saveEndpointDraft, updateBaseUrl],
  );

  const handleRemoveEndpoint = useCallback(
    (endpoint: EndpointType) => {
      if (endpoint === draft.primaryEndpoint) {
        return;
      }

      requestConfirm({
        message: t('settings.provider.apiService.removeEndpointMessage', {
          endpoint: getEndpointLabel(endpoint),
        }),
        onConfirm: () => {
          const { [endpoint]: _removedBaseUrl, ...baseUrlByEndpoint } = draft.baseUrlByEndpoint;
          const nextDraft = {
            ...draft,
            baseUrlByEndpoint,
            visibleEndpointTypes: draft.visibleEndpointTypes.filter((item) => item !== endpoint),
          };

          void (async () => {
            const didSave = await saveEndpointDraft({ endpoint, nextDraft });

            if (didSave) {
              removeEndpoint(endpoint);
              setEndpointErrors((current) => removeEndpointError(current, endpoint));
            }
          })();
        },
        title: t('settings.provider.apiService.removeEndpointTitle'),
      });
    },
    [draft, removeEndpoint, requestConfirm, saveEndpointDraft, t],
  );

  const handlePrimaryEndpointChange = useCallback(
    (endpoint: EndpointType) => {
      if (endpoint === draft.primaryEndpoint) return;

      const previousEndpoint = draft.primaryEndpoint;
      const nextDraft = { ...draft, primaryEndpoint: endpoint };
      updatePrimaryEndpoint(endpoint);

      void (async () => {
        const didSave = await saveEndpointDraft({ endpoint, nextDraft });
        if (!didSave) updatePrimaryEndpoint(previousEndpoint);
      })();
    },
    [draft, saveEndpointDraft, updatePrimaryEndpoint],
  );

  const handleAddEndpoint = useCallback(
    (endpoint: EndpointType) => {
      addEndpoint(endpoint);
      setEndpointErrors((current) => removeEndpointError(current, endpoint));
    },
    [addEndpoint],
  );

  return (
    <>
      <BackHeader title={t('settings.provider.apiService.manageEndpoints')} onBack={requestClose} />
      {discardDialog}
      {confirmDialog}
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
            addableEndpointOptions={buildAddableEndpointOptions(
              provider,
              draft.visibleEndpointTypes,
            )}
            baseUrlByEndpoint={draft.baseUrlByEndpoint}
            endpointErrors={endpointErrors}
            pendingEndpoint={pendingEndpoint}
            primaryEndpoint={draft.primaryEndpoint}
            visibleEndpointTypes={draft.visibleEndpointTypes}
            onAddEndpoint={handleAddEndpoint}
            onBaseUrlChange={handleBaseUrlChange}
            onBaseUrlCommit={handleBaseUrlCommit}
            onPrimaryEndpointChange={handlePrimaryEndpointChange}
            onRemoveEndpoint={handleRemoveEndpoint}
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
