import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  buildAddableEndpointOptions,
  buildProviderApiServiceEndpointUpdates,
  canEditProviderEndpoint,
  type DraftSnapshot,
  getEndpointLabel,
  getProviderApiServiceEndpointDirtyState,
  ProviderApiServiceEndpointForm,
  ProviderApiServiceSaveError,
  useProviderApiServiceConfirmDialog,
  useProviderApiServiceDraft,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import type { EndpointType } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

export default function ProviderEndpointSettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const { apiKeys, authConfig, provider, providerQuery, saveProviderMutation } =
    useProviderApiServiceQueries(providerId ?? '');
  const [endpointErrors, setEndpointErrors] = useState<Partial<Record<EndpointType, string>>>({});
  const [pendingEndpoint, setPendingEndpoint] = useState<EndpointType | null>(null);
  const pendingEndpointRef = useRef<EndpointType | null>(null);
  const { addEndpoint, draft, removeEndpoint, resetEndpointDraft, updateEndpointBaseUrl } =
    useProviderApiServiceDraft({
      apiKeys,
      authConfig,
      provider,
    });
  const hasUnsavedChanges =
    Object.keys(endpointErrors).length > 0 ||
    getProviderApiServiceEndpointDirtyState({ draft, provider });
  const isSaving = saveProviderMutation.isPending || pendingEndpoint !== null;
  const { confirmDialog, requestConfirm } = useProviderApiServiceConfirmDialog();
  const { discardDialog, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges,
    isSaving,
    onClose: resetEndpointDraft,
    onDiscard: resetEndpointDraft,
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
      nextProvider = provider,
    }: {
      endpoint: EndpointType;
      nextDraft: DraftSnapshot;
      nextProvider?: Provider;
    }): Promise<boolean> => {
      if (!nextProvider || pendingEndpointRef.current !== null) {
        return false;
      }

      pendingEndpointRef.current = endpoint;
      setPendingEndpoint(endpoint);

      try {
        const updates = buildProviderApiServiceEndpointUpdates({
          draft: nextDraft,
          provider: nextProvider,
        });
        await saveProviderMutation.mutateAsync(updates);
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
    [getEndpointSaveError, provider, saveProviderMutation],
  );

  const handleBaseUrlChange = useCallback(
    (endpoint: EndpointType, value: string) => {
      updateEndpointBaseUrl(endpoint, value);
      setEndpointErrors((current) => removeEndpointError(current, endpoint));
    },
    [updateEndpointBaseUrl],
  );

  const handleBaseUrlCommit = useCallback(
    (endpoint: EndpointType, value: string) => {
      if (!draft) {
        return;
      }

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

      updateEndpointBaseUrl(endpoint, value);

      void (async () => {
        const didSave = await saveEndpointDraft({ endpoint, nextDraft });

        if (didSave && !value.trim() && endpoint !== draft.primaryEndpoint) {
          removeEndpoint(endpoint);
        }
      })();
    },
    [draft, removeEndpoint, saveEndpointDraft, updateEndpointBaseUrl],
  );

  const handleRemoveEndpoint = useCallback(
    (endpoint: EndpointType) => {
      if (!draft || endpoint === draft.primaryEndpoint) {
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

  const handleAddEndpoint = useCallback(
    (endpoint: EndpointType) => {
      addEndpoint(endpoint);
      setEndpointErrors((current) => removeEndpointError(current, endpoint));
    },
    [addEndpoint],
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

  const addableEndpointOptions = buildAddableEndpointOptions(provider, draft?.visibleEndpointTypes);

  return (
    <>
      <BackHeader title={t('settings.provider.apiService.manageEndpoints')} onBack={requestClose} />
      {discardDialog}
      {confirmDialog}
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          {draft ? (
            <ProviderApiServiceEndpointForm
              addableEndpointOptions={addableEndpointOptions}
              baseUrlByEndpoint={draft.baseUrlByEndpoint}
              endpointErrors={endpointErrors}
              pendingEndpoint={pendingEndpoint}
              primaryEndpoint={draft.primaryEndpoint}
              visibleEndpointTypes={draft.visibleEndpointTypes}
              onAddEndpoint={handleAddEndpoint}
              onBaseUrlChange={handleBaseUrlChange}
              onBaseUrlCommit={handleBaseUrlCommit}
              onRemoveEndpoint={handleRemoveEndpoint}
            />
          ) : null}
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

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});
