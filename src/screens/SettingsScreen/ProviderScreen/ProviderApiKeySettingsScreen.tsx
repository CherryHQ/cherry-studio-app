import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BackHeader } from '@/components/headers';
import {
  getProviderApiServiceApiKeysDirtyState,
  normalizeApiKeyEntries,
  ProviderApiServiceApiKeyForm,
  shouldShowApiKeys,
  useProviderApiServiceConfirmDialog,
  useProviderApiServiceDraft,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from '@/screens/SettingsScreen/ProviderScreen/apiService';
import type { ApiKeyEntry } from '@/data/types/provider';

export default function ProviderApiKeySettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const { apiKeys, authConfig, provider, providerQuery, replaceApiKeysMutation } =
    useProviderApiServiceQueries(providerId ?? '');
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({});
  const [pendingApiKeyIds, setPendingApiKeyIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingApiKeyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const {
    addApiKey,
    draft,
    removeApiKey,
    resetApiKeysDraft,
    syncApiKeysDraft,
    updateApiKey,
    updateApiKeyEnabled,
  } = useProviderApiServiceDraft({
    apiKeys,
    authConfig,
    provider,
  });
  const hasUnsavedChanges =
    Object.keys(apiKeyErrors).length > 0 ||
    getProviderApiServiceApiKeysDirtyState({ apiKeys: apiKeys ?? [], draft });
  const isSaving = replaceApiKeysMutation.isPending || pendingApiKeyIds.size > 0;
  const { confirmDialog, requestConfirm } = useProviderApiServiceConfirmDialog();
  const { discardDialog, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges,
    isSaving,
    onClose: resetApiKeysDraft,
    onDiscard: resetApiKeysDraft,
  });

  const saveApiKeys = useCallback(
    async ({
      apiKeyId,
      nextApiKeys,
    }: {
      apiKeyId: string;
      nextApiKeys: readonly ApiKeyEntry[];
    }): Promise<boolean> => {
      if (!providerId || pendingApiKeyIdsRef.current.size > 0) {
        return false;
      }

      const nextPendingIds = new Set([apiKeyId]);
      pendingApiKeyIdsRef.current = nextPendingIds;
      setPendingApiKeyIds(nextPendingIds);

      try {
        const normalizedApiKeys = normalizeApiKeyEntries(nextApiKeys);
        await replaceApiKeysMutation.mutateAsync(normalizedApiKeys);
        syncApiKeysDraft(providerId, normalizedApiKeys);
        setApiKeyErrors((current) => removeApiKeyError(current, apiKeyId));
        return true;
      } catch {
        setApiKeyErrors((current) => ({
          ...current,
          [apiKeyId]: t('settings.provider.apiService.saveFailed'),
        }));
        return false;
      } finally {
        const nextPendingIds = new Set<string>();
        pendingApiKeyIdsRef.current = nextPendingIds;
        setPendingApiKeyIds(nextPendingIds);
      }
    },
    [providerId, replaceApiKeysMutation, syncApiKeysDraft, t],
  );

  const handleAddApiKey = useCallback(() => {
    addApiKey();
  }, [addApiKey]);

  const handleKeyChange = useCallback(
    (id: string, key: string) => {
      updateApiKey(id, key);
      setApiKeyErrors((current) => removeApiKeyError(current, id));
    },
    [updateApiKey],
  );

  const handleCommitKey = useCallback(
    (id: string, key: string) => {
      if (!draft) {
        return;
      }

      const nextApiKeys = draft.apiKeyEntries.map((entry) =>
        entry.id === id ? { ...entry, key } : entry,
      );
      const isPersisted = apiKeys?.some((entry) => entry.id === id) ?? false;

      updateApiKey(id, key);

      if (!key.trim()) {
        if (!isPersisted) {
          removeApiKey(id);
          setApiKeyErrors((current) => removeApiKeyError(current, id));
          return;
        }

        setApiKeyErrors((current) => ({
          ...current,
          [id]: t('settings.provider.apiService.apiKeyRequired'),
        }));
        return;
      }

      void saveApiKeys({ apiKeyId: id, nextApiKeys });
    },
    [apiKeys, draft, removeApiKey, saveApiKeys, t, updateApiKey],
  );

  const handleEnabledChange = useCallback(
    (id: string, isEnabled: boolean) => {
      if (!draft) {
        return;
      }

      const nextApiKeys = draft.apiKeyEntries.map((entry) =>
        entry.id === id ? { ...entry, isEnabled } : entry,
      );

      updateApiKeyEnabled(id, isEnabled);
      setApiKeyErrors((current) => removeApiKeyError(current, id));
      void saveApiKeys({ apiKeyId: id, nextApiKeys });
    },
    [draft, saveApiKeys, updateApiKeyEnabled],
  );

  const handleRemoveApiKey = useCallback(
    (id: string) => {
      if (!draft) {
        return;
      }

      const apiKey = draft.apiKeyEntries.find((entry) => entry.id === id);
      const isPersisted = apiKeys?.some((entry) => entry.id === id) ?? false;

      if (!apiKey?.key.trim() && !isPersisted) {
        removeApiKey(id);
        setApiKeyErrors((current) => removeApiKeyError(current, id));
        return;
      }

      requestConfirm({
        message: t('settings.provider.apiService.removeApiKeyMessage'),
        onConfirm: () => {
          const nextApiKeys = draft.apiKeyEntries.filter((entry) => entry.id !== id);

          void (async () => {
            const didSave = await saveApiKeys({ apiKeyId: id, nextApiKeys });

            if (didSave) {
              removeApiKey(id);
              setApiKeyErrors((current) => removeApiKeyError(current, id));
            }
          })();
        },
        title: t('settings.provider.apiService.removeApiKeyTitle'),
      });
    },
    [apiKeys, draft, removeApiKey, requestConfirm, saveApiKeys, t],
  );

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  if (draft && !shouldShowApiKeys(draft.authDraft.type)) {
    return (
      <Redirect
        href={{
          params: {
            ...(providerName || provider?.name
              ? { providerName: providerName ?? provider?.name }
              : {}),
            providerId,
          },
          pathname: '/settings/provider/[providerId]',
        }}
      />
    );
  }

  return (
    <>
      <BackHeader title={t('settings.provider.apiService.manageApiKeys')} onBack={requestClose} />
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
            <ProviderApiServiceApiKeyForm
              apiKeyErrors={apiKeyErrors}
              apiKeys={draft.apiKeyEntries}
              pendingApiKeyIds={pendingApiKeyIds}
              onAdd={handleAddApiKey}
              onCommitKey={handleCommitKey}
              onEnabledChange={handleEnabledChange}
              onKeyChange={handleKeyChange}
              onRemove={handleRemoveApiKey}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function removeApiKeyError(errors: Record<string, string>, id: string): Record<string, string> {
  if (!errors[id]) {
    return errors;
  }

  const { [id]: _removedError, ...nextErrors } = errors;
  return nextErrors;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});
