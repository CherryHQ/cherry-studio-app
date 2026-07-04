import * as Clipboard from 'expo-clipboard';
import { Button } from 'heroui-native/button';
import { Dialog } from 'heroui-native/dialog';
import { Input } from 'heroui-native/input';
import { Label } from 'heroui-native/label';
import { Switch } from 'heroui-native/switch';
import { TextField } from 'heroui-native/text-field';
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-uniwind/png';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { ApiKeyEntry } from '@/data/types/provider';
import { SettingsDialogActionButton } from '@/screens/SettingsScreen/components/SettingsDialogActionButton';
import { SettingsIconButton } from '@/screens/SettingsScreen/components/SettingsIconButton';
import { providerApiServiceStyles } from '../utils/providerApiServiceStyles';

const apiKeyPreviewMaxLength = 21;

export function ProviderApiServiceApiKeysField({
  apiKeysInput,
  apiKeysVisible,
  onManagePress,
  onToggleVisible,
}: {
  apiKeysInput: string;
  apiKeysVisible: boolean;
  onManagePress: () => void;
  onToggleVisible: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <Text className="font-medium text-default-foreground text-sm">
        {t('settings.provider.apiService.apiKeys')}
      </Text>
      <View className="flex-row items-center gap-2">
        {apiKeysVisible ? (
          <View className="h-10 min-w-0 flex-1 overflow-hidden rounded-xl">
            <ApiKeysVisiblePreview
              accessibilityLabel={t('settings.provider.apiService.apiKeys')}
              onPress={onManagePress}
              placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
              value={apiKeysInput}
            />
          </View>
        ) : (
          <ApiKeysMaskedPreview
            accessibilityLabel={t('settings.provider.apiService.apiKeys')}
            hasValue={apiKeysInput.trim().length > 0}
            placeholder={t('settings.provider.apiService.apiKeysPlaceholder')}
            onPress={onToggleVisible}
          />
        )}
        <SettingsIconButton
          accessibilityLabel={
            apiKeysVisible
              ? t('settings.provider.apiService.hideApiKeys')
              : t('settings.provider.apiService.showApiKeys')
          }
          onPress={onToggleVisible}
        >
          <ApiKeysVisibilityIcon visible={apiKeysVisible} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.manageApiKeys')}
          onPress={onManagePress}
        >
          <KeyRoundIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
      </View>
    </View>
  );
}

function ApiKeysVisiblePreview({
  accessibilityLabel,
  onPress,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  placeholder: string;
  value: string;
}) {
  const previewValue = clipApiKeyPreviewValue(normalizeApiKeysInputSingleLine(value));

  return (
    <Input
      accessibilityLabel={accessibilityLabel}
      autoCapitalize="none"
      autoCorrect={false}
      className="h-10 max-h-10 min-h-0 w-full overflow-hidden rounded-xl px-3 py-0 text-base leading-5"
      editable={false}
      multiline={false}
      numberOfLines={1}
      onPressIn={onPress}
      placeholder={placeholder}
      returnKeyType="done"
      scrollEnabled={false}
      style={providerApiServiceStyles.input}
      value={previewValue}
      variant="secondary"
    />
  );
}

function ApiKeysMaskedPreview({
  accessibilityLabel,
  hasValue,
  onPress,
  placeholder,
}: {
  accessibilityLabel: string;
  hasValue: boolean;
  onPress: () => void;
  placeholder: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="h-10 min-h-0 flex-1 justify-center overflow-hidden rounded-xl bg-settings-grouped-surface px-3 active:opacity-70"
      onPress={onPress}
    >
      <Text
        className={hasValue ? 'text-base text-foreground' : 'text-base text-default-foreground'}
        numberOfLines={1}
      >
        {hasValue ? '••••••••••••••••••••••••••••••••' : placeholder}
      </Text>
    </Pressable>
  );
}

export function ProviderApiServiceApiKeyForm({
  apiKeys,
  apiKeyErrors,
  pendingApiKeyIds,
  onAdd,
  onCommitKey,
  onEnabledChange,
  onKeyChange,
  onRemove,
}: {
  apiKeys: readonly ApiKeyEntry[];
  apiKeyErrors?: Record<string, string>;
  pendingApiKeyIds?: ReadonlySet<string>;
  onAdd: () => void;
  onCommitKey: (id: string, key: string) => void;
  onEnabledChange: (id: string, isEnabled: boolean) => void;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3">
      {apiKeys.length > 0 ? (
        <View className="gap-3">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow
              apiKey={apiKey}
              errorMessage={apiKeyErrors?.[apiKey.id]}
              key={apiKey.id}
              isPending={pendingApiKeyIds?.has(apiKey.id) ?? false}
              onCommitKey={onCommitKey}
              onEnabledChange={onEnabledChange}
              onKeyChange={onKeyChange}
              onRemove={onRemove}
            />
          ))}
        </View>
      ) : null}

      <Button
        className="h-10 min-h-10 flex-row items-center justify-center gap-2 rounded-xl"
        onPress={onAdd}
        variant="secondary"
      >
        <PlusIcon className="size-4 text-default-foreground" strokeWidth={2} />
        <Text className="text-base text-foreground">
          {t('settings.provider.apiService.addApiKey')}
        </Text>
      </Button>
    </View>
  );
}

function ApiKeysVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <EyeIcon className="size-5 text-default-foreground" strokeWidth={2} />
  ) : (
    <EyeOffIcon className="size-5 text-default-foreground" strokeWidth={2} />
  );
}

function ApiKeyRow({
  apiKey,
  errorMessage,
  isPending,
  onCommitKey,
  onEnabledChange,
  onKeyChange,
  onRemove,
}: {
  apiKey: ApiKeyEntry;
  errorMessage?: string;
  isPending: boolean;
  onCommitKey: (id: string, key: string) => void;
  onEnabledChange: (id: string, isEnabled: boolean) => void;
  onKeyChange: (id: string, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <View className="min-h-8 flex-row items-center justify-between gap-3">
        <Text className="font-medium text-default-foreground text-sm">
          {t('settings.provider.apiService.apiKey')}
        </Text>
        <Switch
          accessibilityLabel={t('settings.provider.apiService.apiKeyEnabled')}
          isDisabled={isPending}
          isSelected={apiKey.isEnabled}
          onSelectedChange={(isEnabled) => onEnabledChange(apiKey.id, isEnabled)}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <View className="h-10 min-w-0 flex-1 overflow-hidden rounded-xl">
          <ApiKeyInput
            accessibilityLabel={t('settings.provider.apiService.apiKey')}
            isDisabled={!apiKey.isEnabled || isPending}
            value={apiKey.key}
            onChangeText={(key) => onKeyChange(apiKey.id, key)}
            onCommit={(key) => onCommitKey(apiKey.id, key)}
          />
        </View>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.copyApiKey')}
          isDisabled={isPending}
          onPress={() => void Clipboard.setStringAsync(apiKey.key)}
        >
          <CopyIcon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
        <SettingsIconButton
          accessibilityLabel={t('settings.provider.apiService.removeApiKey')}
          isDisabled={isPending}
          onPress={() => onRemove(apiKey.id)}
        >
          <Trash2Icon className="size-5 text-default-foreground" strokeWidth={2} />
        </SettingsIconButton>
      </View>
      {errorMessage ? <Text className="text-danger text-xs">{errorMessage}</Text> : null}
    </View>
  );
}

function ApiKeyInput({
  accessibilityLabel,
  isDisabled,
  onCommit,
  onChangeText,
  value,
}: {
  accessibilityLabel: string;
  isDisabled?: boolean;
  onCommit: (value: string) => void;
  onChangeText: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const normalizedValue = normalizeApiKeySingleLine(value);
  const previewValue = clipApiKeyPreviewValue(normalizedValue);
  const normalizedDraftValue = normalizeApiKeySingleLine(draftValue);
  const isSaveDisabled = isDisabled || normalizedDraftValue === normalizedValue;

  const openDialog = useCallback(() => {
    if (isDisabled) {
      return;
    }

    setDraftValue(normalizedValue);
    setIsDialogOpen(true);
  }, [isDisabled, normalizedValue]);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setDraftValue('');
  }, []);

  const handleDraftChange = useCallback((nextValue: string) => {
    setDraftValue(normalizeApiKeySingleLine(nextValue));
  }, []);

  const saveDialog = useCallback(() => {
    if (isSaveDisabled) {
      return;
    }

    onChangeText(normalizedDraftValue);
    onCommit(normalizedDraftValue);
    closeDialog();
  }, [closeDialog, isSaveDisabled, normalizedDraftValue, onChangeText, onCommit]);

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        className="h-10 max-h-10 min-h-0 w-full justify-center overflow-hidden rounded-xl bg-default px-3 active:opacity-70 disabled:opacity-disabled"
        disabled={isDisabled}
        onPress={openDialog}
      >
        <Text
          className={
            previewValue ? 'text-base text-foreground' : 'text-base text-default-foreground'
          }
          numberOfLines={1}
        >
          {previewValue || t('settings.provider.apiService.apiKeyPlaceholder')}
        </Text>
      </Pressable>
      <Dialog isOpen={isDialogOpen} onOpenChange={(isOpen) => !isOpen && closeDialog()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <Dialog.Title>{t('settings.provider.apiService.apiKey')}</Dialog.Title>
            <TextField>
              <Label>{t('settings.provider.apiService.apiKey')}</Label>
              <Input
                accessibilityLabel={accessibilityLabel}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                className="min-h-10 rounded-xl px-3 py-0 text-base leading-5"
                multiline={false}
                numberOfLines={1}
                onChangeText={handleDraftChange}
                onSubmitEditing={() => {
                  if (!isSaveDisabled) {
                    saveDialog();
                  }
                }}
                placeholder={t('settings.provider.apiService.apiKeyPlaceholder')}
                returnKeyType="done"
                scrollEnabled={false}
                selectTextOnFocus
                style={providerApiServiceStyles.dialogInput}
                value={draftValue}
                variant="secondary"
              />
            </TextField>
            <View className="flex-row justify-end gap-3">
              <SettingsDialogActionButton label={t('common.cancel')} onPress={closeDialog} />
              <SettingsDialogActionButton
                isDisabled={isSaveDisabled}
                isPrimary
                label={t('common.save')}
                onPress={saveDialog}
              />
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </>
  );
}

function clipApiKeyPreviewValue(value: string): string {
  if (value.length <= apiKeyPreviewMaxLength) {
    return value;
  }

  return `${value.slice(0, apiKeyPreviewMaxLength)}...`;
}

function normalizeApiKeySingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, '');
}

function normalizeApiKeysInputSingleLine(value: string): string {
  return value.replaceAll(/[\r\n]+/g, ',');
}
