import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  Button,
  Input,
  type MenuItem,
  Section,
  Sortable,
  Switch,
} from '@cherrystudio/ui/components';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { withPolicy } from '@/frontend/components/Policy';
import { reorderLocally } from '@/frontend/data/utils/reorder';
import type { ProviderConfigurationValue } from '@/frontend/types/providerConfiguration';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  API_KEY_ERROR_LABELS,
  createApiKeyEntry,
  getApiKeyValidationError,
  getProviderApiKeyLabel,
  maskProviderApiKey,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import { useProviderApiKeySheet } from '../hooks/useProviderApiKeySheet';
import { ProviderApiKeySheet } from './ProviderApiKeySheet';

const API_KEY_ROW_ESTIMATED_HEIGHT = 68;

/**
 * API keys as rows. Without any key the first one is typed straight into the card; after
 * that each key toggles in place, opens a sheet for its label or removal, and supports
 * unified long-press reordering when editable.
 */
function ApiKeysSection({
  apiKeys,
  editable = true,
  revealsKeys = true,
  value,
}: {
  apiKeys: readonly ApiKeyEntry[];
  /** Keys can be added and reordered; an organization supplies its own instead. */
  editable?: boolean;
  /** Shows each key's masked value; an organization's key stays withheld. */
  revealsKeys?: boolean;
  value: ProviderConfigurationValue;
}) {
  const { t } = useTranslation();
  const sheet = useProviderApiKeySheet(apiKeys, value.actions);
  const enabledCount = apiKeys.filter((entry) => entry.isEnabled).length;
  const unnamedLabel = t('settings.provider.apiService.keys.rowTitle');
  const apiKeyIds = useMemo(() => apiKeys.map((entry) => entry.id), [apiKeys]);
  const canMoveKeys = editable && !value.isBusy && apiKeys.length > 1;

  return (
    <>
      <Sortable.Group
        estimatedItemHeight={API_KEY_ROW_ESTIMATED_HEIGHT}
        groupId="api-keys"
        itemIds={apiKeyIds}
        onReorder={({ fromIndex, toIndex }) => {
          if (!canMoveKeys) return;
          void value.actions.reorderApiKeys(reorderLocally(apiKeys, fromIndex, toIndex));
        }}
      >
        <Section
          footer={
            apiKeys.length > 0
              ? t(
                  apiKeys.length > 1
                    ? 'settings.provider.apiService.keys.rotationSummary'
                    : 'settings.provider.apiService.keys.summary',
                  { enabled: enabledCount, total: apiKeys.length },
                )
              : undefined
          }
        >
          <Section.Header title={t('settings.provider.apiService.keys.title')} />
          {editable && apiKeys.length === 0 ? (
            <Section.Item>
              <FirstApiKeyField disabled={value.isBusy} onAdd={value.actions.addApiKey} />
            </Section.Item>
          ) : null}
          {apiKeys.map((entry, index) => {
            const name = getProviderApiKeyLabel(entry, unnamedLabel);
            const error = getApiKeyValidationError(entry, apiKeys);
            const accessibleKeyName = t('settings.provider.apiService.keys.accessibleLabel', {
              key: revealsKeys ? maskProviderApiKey(entry.key) : t('enterprise.managed.hidden'),
              name,
            });
            const menuItems: MenuItem[] =
              editable && !value.isBusy
                ? [
                    {
                      id: 'edit',
                      label: t('common.edit'),
                      onPress: () => sheet.startEdit(entry),
                    },
                    ...(canMoveKeys && index > 0
                      ? [
                          {
                            id: 'move-to-top',
                            label: t('common.moveToTop'),
                            onPress: () =>
                              void value.actions.reorderApiKeys(reorderLocally(apiKeys, index, 0)),
                          },
                        ]
                      : []),
                    {
                      destructive: true,
                      id: 'delete',
                      label: t('common.delete'),
                      onPress: () => void value.actions.removeApiKey(entry.id),
                    },
                  ]
                : [];

            return (
              <Sortable.Item
                accessibilityLabels={{
                  moveDown: t('common.moveDown', { name: accessibleKeyName }),
                  moveToTop: t('common.moveToTop'),
                  moveUp: t('common.moveUp', { name: accessibleKeyName }),
                }}
                disabled={!editable || value.isBusy}
                estimatedHeight={API_KEY_ROW_ESTIMATED_HEIGHT}
                groupId="api-keys"
                groupSize={apiKeys.length}
                id={entry.id}
                index={index}
                key={entry.id}
                menuItems={menuItems}
                movable={canMoveKeys}
              >
                <Section.Item
                  accessibilityLabel={accessibleKeyName}
                  description={
                    <Text
                      className={
                        error
                          ? 'text-destructive text-sm'
                          : revealsKeys
                            ? 'font-mono text-muted-foreground text-sm'
                            : 'text-muted-foreground text-sm'
                      }
                    >
                      {error
                        ? t(API_KEY_ERROR_LABELS[error])
                        : revealsKeys
                          ? maskProviderApiKey(entry.key)
                          : t('enterprise.managed.hidden')}
                    </Text>
                  }
                  disabled={value.isBusy}
                  label={name}
                  onPress={() => sheet.startEdit(entry)}
                  testID={`provider-api-key-row-${entry.id}`}
                  trailing={
                    <Sortable.Exclusion>
                      <Switch
                        accessibilityLabel={t('settings.provider.apiService.keys.enable', { name })}
                        disabled={value.isBusy}
                        onValueChange={(isEnabled) =>
                          void value.actions.updateApiKey(entry.id, { isEnabled })
                        }
                        testID={`provider-api-key-enabled-${entry.id}`}
                        value={entry.isEnabled}
                      />
                    </Sortable.Exclusion>
                  }
                />
              </Sortable.Item>
            );
          })}
          {editable && apiKeys.length > 0 ? (
            <Section.Item
              accessibilityLabel={t('settings.provider.apiService.keys.add')}
              disabled={value.isBusy}
              label={
                <View className="flex-row items-center gap-2">
                  <PlusIcon className="size-5 text-foreground" />
                  <Text className="text-base text-foreground">
                    {t('settings.provider.apiService.keys.add')}
                  </Text>
                </View>
              }
              onPress={sheet.startAdd}
              showChevron={false}
              testID="provider-api-key-add"
            />
          ) : null}
          {editable && value.apiKeyUrl ? (
            <Section.Item
              accessibilityRole="link"
              label={t('onboarding.connection.getKey')}
              onPress={() => void openExternalUrl(value.apiKeyUrl ?? '')}
              testID="provider-api-key-help"
            />
          ) : null}
        </Section>
      </Sortable.Group>
      <ProviderApiKeySheet
        disabled={value.isBusy}
        error={sheet.error}
        onChange={sheet.change}
        onClose={sheet.close}
        onRemove={sheet.remove}
        onSubmit={sheet.submit}
        state={sheet.state}
      />
    </>
  );
}

/** The first key goes straight in: paste it and add, without opening a sheet. */
function FirstApiKeyField({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (entry: ApiKeyEntry) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const trimmedKey = key.trim();
  const candidate = { id: 'first-key', isEnabled: true, key: trimmedKey };
  const error = trimmedKey ? getApiKeyValidationError(candidate, [candidate]) : undefined;

  // Leaving the field adds the key too, so a pasted key is never lost to a missed tap.
  // Tapping Add also ends editing; the latch keeps that from adding the key twice.
  const adding = useRef(false);
  const add = () => {
    if (!trimmedKey || error || adding.current) return;
    adding.current = true;
    void onAdd({ ...createApiKeyEntry(), key: trimmedKey })
      .then((added) => {
        if (added) setKey('');
      })
      .finally(() => {
        adding.current = false;
      });
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Input
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            disabled={disabled}
            invalid={Boolean(error)}
            onChangeText={setKey}
            onEndEditing={add}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            returnKeyType="done"
            testID="provider-first-api-key-input"
            type="password"
            value={key}
            visibilityAccessibilityLabels={{
              hide: t('settings.provider.apiService.hideApiKeys'),
              show: t('settings.provider.apiService.showApiKeys'),
            }}
          />
        </View>
        <Button
          disabled={disabled || !trimmedKey || Boolean(error)}
          onPress={add}
          size="sm"
          testID="provider-first-api-key-add"
        >
          {t('common.add')}
        </Button>
      </View>
      {error ? (
        <Text className="text-destructive text-sm">{t(API_KEY_ERROR_LABELS[error])}</Text>
      ) : null}
    </View>
  );
}

/** An organization's keys stay listed but withheld, without ways to add or reorder them. */
export const ProviderApiKeysSection = withPolicy(ApiKeysSection, (policy) => ({
  editable: policy.canEdit('provider'),
  revealsKeys: policy.revealsSecrets,
}));
