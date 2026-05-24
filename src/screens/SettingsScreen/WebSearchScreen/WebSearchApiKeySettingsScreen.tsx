import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  normalizeWebSearchApiKeys,
  useWebSearchApiKeySettings,
  WebSearchApiServiceApiKeyForm,
  type WebSearchApiKeyEntry,
} from '@/screens/SettingsScreen/WebSearchScreen/apiService';
import { WEB_SEARCH_PROVIDER_IDS, type WebSearchProviderId } from '@/data/preference';
import { useSettingsConfirmDialog } from '../hooks/useSettingsConfirmDialog';
import {
  getWebSearchProviderDetailSections,
  getWebSearchProviderPreset,
} from './utils/providerSettings';

function isWebSearchProviderId(value: string): value is WebSearchProviderId {
  return WEB_SEARCH_PROVIDER_IDS.includes(value as WebSearchProviderId);
}

export default function WebSearchApiKeySettingsScreen() {
  const { providerId, providerName } = useLocalSearchParams<{
    providerId?: string;
    providerName?: string;
  }>();
  const router = useRouter();
  const { t } = useTranslation();
  const validProviderId = providerId && isWebSearchProviderId(providerId) ? providerId : undefined;
  const provider = validProviderId ? getWebSearchProviderPreset(validProviderId) : undefined;
  const canManageApiKeys =
    provider &&
    getWebSearchProviderDetailSections(provider.id).some((section) => section.type === 'apiKeys');
  const { addApiKey, entries, removeApiKey, saveApiKeys, updateApiKey } =
    useWebSearchApiKeySettings(validProviderId);
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({});
  const [pendingApiKeyIds, setPendingApiKeyIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingApiKeyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const { confirmDialog, requestConfirm } = useSettingsConfirmDialog();

  const closeSheet = useCallback(() => {
    router.back();
  }, [router]);

  const saveEntries = useCallback(
    async ({
      apiKeyId,
      nextEntries,
    }: {
      apiKeyId: string;
      nextEntries: readonly WebSearchApiKeyEntry[];
    }): Promise<boolean> => {
      if (pendingApiKeyIdsRef.current.size > 0) {
        return false;
      }

      const nextPendingIds = new Set([apiKeyId]);
      pendingApiKeyIdsRef.current = nextPendingIds;
      setPendingApiKeyIds(nextPendingIds);

      try {
        await saveApiKeys(nextEntries);
        setApiKeyErrors((current) => removeApiKeyError(current, apiKeyId));
        return true;
      } catch {
        setApiKeyErrors((current) => ({
          ...current,
          [apiKeyId]: t('settings.websearch.provider.saveFailed'),
        }));
        return false;
      } finally {
        const nextPendingIds = new Set<string>();
        pendingApiKeyIdsRef.current = nextPendingIds;
        setPendingApiKeyIds(nextPendingIds);
      }
    },
    [saveApiKeys, t],
  );

  const handleKeyChange = useCallback(
    (id: string, key: string) => {
      updateApiKey(id, key);
      setApiKeyErrors((current) => removeApiKeyError(current, id));
    },
    [updateApiKey],
  );

  const handleCommitKey = useCallback(
    (id: string, key: string) => {
      const entry = entries.find((item) => item.id === id);

      if (!entry) {
        return;
      }

      const nextEntries = entries.map((item) => (item.id === id ? { ...item, key } : item));
      updateApiKey(id, key);

      if (!key.trim()) {
        if (entry.isNew) {
          removeApiKey(id);
          setApiKeyErrors((current) => removeApiKeyError(current, id));
          return;
        }

        setApiKeyErrors((current) => ({
          ...current,
          [id]: t('settings.websearch.provider.apiKeyRequired'),
        }));
        return;
      }

      const otherKeys = normalizeWebSearchApiKeys(
        entries.filter((item) => item.id !== id).map((item) => item.key),
      );

      if (otherKeys.includes(key.trim())) {
        setApiKeyErrors((current) => ({
          ...current,
          [id]: t('settings.websearch.provider.apiKeyDuplicate'),
        }));
        return;
      }

      void (async () => {
        const didSave = await saveEntries({ apiKeyId: id, nextEntries });

        if (didSave && entry.isNew) {
          removeApiKey(id);
        }
      })();
    },
    [entries, removeApiKey, saveEntries, t, updateApiKey],
  );

  const handleRemoveApiKey = useCallback(
    (id: string) => {
      const entry = entries.find((item) => item.id === id);

      if (!entry) {
        return;
      }

      if (entry.isNew || !entry.key.trim()) {
        removeApiKey(id);
        setApiKeyErrors((current) => removeApiKeyError(current, id));
        return;
      }

      requestConfirm({
        message: t('settings.websearch.provider.removeApiKeyMessage'),
        onConfirm: () => {
          const nextEntries = entries.filter((item) => item.id !== id);

          void (async () => {
            const didSave = await saveEntries({ apiKeyId: id, nextEntries });

            if (didSave) {
              removeApiKey(id);
              setApiKeyErrors((current) => removeApiKeyError(current, id));
            }
          })();
        },
        title: t('settings.websearch.provider.removeApiKeyTitle'),
      });
    },
    [entries, removeApiKey, requestConfirm, saveEntries, t],
  );

  if (!provider || !canManageApiKeys) {
    return <Redirect href="/settings/websearch" />;
  }

  return (
    <>
      <BackHeader
        title={providerName ?? t('settings.websearch.provider.manageApiKeys')}
        onBack={closeSheet}
      />
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
          <WebSearchApiServiceApiKeyForm
            apiKeyErrors={apiKeyErrors}
            apiKeys={entries}
            pendingApiKeyIds={pendingApiKeyIds}
            onAdd={addApiKey}
            onCommitKey={handleCommitKey}
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

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
});
