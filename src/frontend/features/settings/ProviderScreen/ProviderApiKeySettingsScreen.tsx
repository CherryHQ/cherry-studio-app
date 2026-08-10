import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAlert } from '@/frontend/components/AlertProvider';
import { BackHeader } from '@/frontend/components/headers';

import {
  getEffectiveAuthConfig,
  getProviderApiServiceApiKeysDirtyState,
  normalizeApiKeyEntries,
  ProviderApiServiceApiKeyForm,
  shouldShowApiKeys,
  useProviderApiServiceApiKeysDraft,
  useProviderApiServiceQueries,
  useProviderApiServiceSheetClose,
} from './apiService';

export default function ProviderApiKeySettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const { t } = useTranslation();
  const { apiKeys, authConfig, authConfigQuery, provider, providerQuery, replaceApiKeysMutation } =
    useProviderApiServiceQueries(providerId ?? '');
  const saveApiKeys = useCallback(
    (nextApiKeys: ApiKeyEntry[]) => replaceApiKeysMutation.mutateAsync(nextApiKeys),
    [replaceApiKeysMutation],
  );

  if (!providerId || providerQuery.isError) {
    return <Redirect href="/settings/provider" />;
  }

  // Wait for the auth config before deciding anything: it is what says whether this
  // provider has API keys at all, so mounting the form first would show a screen we
  // then redirect away from — and only on a cold cache, where the keys land first.
  if (!provider || !apiKeys || authConfigQuery.isPending) {
    return <BackHeader title={t('settings.provider.apiService.manageApiKeys')} />;
  }

  if (!shouldShowApiKeys(getEffectiveAuthConfig(authConfig, provider).type, provider)) {
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

  return <ProviderApiKeySettingsForm apiKeys={apiKeys} onSave={saveApiKeys} />;
}

function ProviderApiKeySettingsForm({
  apiKeys,
  onSave,
}: {
  apiKeys: readonly ApiKeyEntry[];
  onSave: (nextApiKeys: ApiKeyEntry[]) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({});
  const [pendingApiKeyIds, setPendingApiKeyIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingApiKeyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const { alert } = useAlert();
  const { addKey, entries, removeKey, restoreKey, updateKey, updateKeyEnabled } =
    useProviderApiServiceApiKeysDraft(apiKeys);
  const hasUnsavedChanges =
    Object.keys(apiKeyErrors).length > 0 ||
    getProviderApiServiceApiKeysDirtyState({ apiKeys, entries });
  const isSaving = pendingApiKeyIds.size > 0;
  const { requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges,
    isSaving,
  });

  const saveEntries = useCallback(
    async ({
      apiKeyId,
      nextEntries,
    }: {
      apiKeyId: string;
      nextEntries: readonly ApiKeyEntry[];
    }): Promise<boolean> => {
      if (pendingApiKeyIdsRef.current.size > 0) {
        return false;
      }

      const nextPendingIds = new Set([apiKeyId]);
      pendingApiKeyIdsRef.current = nextPendingIds;
      setPendingApiKeyIds(nextPendingIds);

      let didSave = false;
      try {
        await onSave(normalizeApiKeyEntries(nextEntries));
        setApiKeyErrors((current) => removeApiKeyError(current, apiKeyId));
        didSave = true;
      } catch {
        setApiKeyErrors((current) => ({
          ...current,
          [apiKeyId]: t('settings.provider.apiService.saveFailed'),
        }));
      }

      const clearedPendingIds = new Set<string>();
      pendingApiKeyIdsRef.current = clearedPendingIds;
      setPendingApiKeyIds(clearedPendingIds);
      return didSave;
    },
    [onSave, t],
  );

  const handleKeyChange = useCallback(
    (id: string, key: string) => {
      updateKey(id, key);
      setApiKeyErrors((current) => removeApiKeyError(current, id));
    },
    [updateKey],
  );

  const handleCommitKey = useCallback(
    (id: string, key: string) => {
      const nextEntries = entries.map((entry) => (entry.id === id ? { ...entry, key } : entry));
      const persistedApiKey = apiKeys.find((entry) => entry.id === id);

      updateKey(id, key);

      if (!key.trim()) {
        if (!persistedApiKey) {
          removeKey(id);
          setApiKeyErrors((current) => removeApiKeyError(current, id));
          return;
        }

        setApiKeyErrors((current) => ({
          ...current,
          [id]: t('settings.provider.apiService.apiKeyRequired'),
        }));
        return;
      }

      if (persistedApiKey?.key === key) {
        setApiKeyErrors((current) => removeApiKeyError(current, id));
        return;
      }

      void saveEntries({ apiKeyId: id, nextEntries });
    },
    [apiKeys, entries, removeKey, saveEntries, t, updateKey],
  );

  const handleEnabledChange = useCallback(
    (id: string, isEnabled: boolean) => {
      const nextEntries = entries.map((entry) =>
        entry.id === id ? { ...entry, isEnabled } : entry,
      );

      updateKeyEnabled(id, isEnabled);
      setApiKeyErrors((current) => removeApiKeyError(current, id));
      void saveEntries({ apiKeyId: id, nextEntries });
    },
    [entries, saveEntries, updateKeyEnabled],
  );

  const handleRemoveApiKey = useCallback(
    (id: string) => {
      const entryIndex = entries.findIndex((item) => item.id === id);
      const entry = entries[entryIndex];
      const isPersisted = apiKeys.some((item) => item.id === id);

      if (!entry) {
        return;
      }

      if (!entry?.key.trim() && !isPersisted) {
        removeKey(id);
        setApiKeyErrors((current) => removeApiKeyError(current, id));
        return;
      }

      alert.confirm({
        confirmLabel: t('common.remove'),
        description: t('settings.provider.apiService.removeApiKeyMessage'),
        onConfirm: () => {
          const nextEntries = entries.filter((item) => item.id !== id);
          removeKey(id);
          setApiKeyErrors((current) => removeApiKeyError(current, id));

          void (async () => {
            const didSave = await saveEntries({ apiKeyId: id, nextEntries });

            if (!didSave) {
              restoreKey(entry, entryIndex);
              alert.show({ title: t('settings.provider.apiService.saveFailed') });
            }
          })();
        },
        role: 'destructive',
        title: t('settings.provider.apiService.removeApiKeyTitle'),
      });
    },
    [alert, apiKeys, entries, removeKey, restoreKey, saveEntries, t],
  );

  return (
    <>
      <BackHeader title={t('settings.provider.apiService.manageApiKeys')} onBack={requestClose} />
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
          <ProviderApiServiceApiKeyForm
            apiKeyErrors={apiKeyErrors}
            apiKeys={entries}
            pendingApiKeyIds={pendingApiKeyIds}
            onAdd={addKey}
            onCommitKey={handleCommitKey}
            onEnabledChange={handleEnabledChange}
            onKeyChange={handleKeyChange}
            onRemove={handleRemoveApiKey}
          />
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
