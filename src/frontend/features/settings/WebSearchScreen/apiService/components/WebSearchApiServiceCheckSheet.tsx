import { Select } from 'heroui-native';
import { ChevronDownIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/frontend/components/bottomSheet';

import { SettingsDialogActionButton } from '../../../components/SettingsDialogActionButton';

const selectContentWidth = 256;

export type WebSearchApiServiceCheckApiKeyOption = {
  key: string;
  label: string;
  value: string;
};

type WebSearchApiServiceCheckSheetProps = {
  apiKeyOptions: WebSearchApiServiceCheckApiKeyOption[];
  checkResult?: {
    status: 'error';
    message: string;
  } | null;
  isChecking?: boolean;
  isOpen: boolean;
  onApiKeyChange: (apiKeyId: string) => void;
  onClose: () => void;
  onStart: () => Promise<void> | void;
  selectedApiKeyId: string | null;
};

export function WebSearchApiServiceCheckSheet({
  apiKeyOptions,
  checkResult,
  isChecking = false,
  isOpen,
  onApiKeyChange,
  onClose,
  onStart,
  selectedApiKeyId,
}: WebSearchApiServiceCheckSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const selectedApiKey = useMemo(
    () => apiKeyOptions.find((option) => option.value === selectedApiKeyId) ?? apiKeyOptions[0],
    [apiKeyOptions, selectedApiKeyId],
  );
  const selectedApiKeyOption = selectedApiKey
    ? { label: selectedApiKey.label, value: selectedApiKey.value }
    : undefined;
  const handleApiKeyValueChange = useCallback(
    (nextOption?: { value: string }) => {
      if (nextOption?.value) {
        onApiKeyChange(nextOption.value);
      }
    },
    [onApiKeyChange],
  );

  return (
    <BottomSheet
      closeAccessibilityLabel={t('common.close')}
      isCloseDisabled={isChecking}
      isOpen={isOpen}
      onClose={onClose}
      testID="websearch-apiservice-check"
      title={t('settings.websearch.provider.checkTitle')}
    >
      <View className="gap-5 px-5 pt-1" style={{ paddingBottom: Math.max(20, insets.bottom + 12) }}>
        <View className="gap-4">
          <View className="gap-2">
            <Text className="px-1 font-medium text-default-foreground text-sm">
              {t('settings.websearch.provider.checkApiKeySection')}
            </Text>
            <Select onValueChange={handleApiKeyValueChange} value={selectedApiKeyOption}>
              <Select.Trigger
                accessibilityLabel={t('settings.websearch.provider.checkApiKeySection')}
                className="flex-row items-center rounded-xl bg-settings-grouped-surface px-3 py-2 shadow-none"
              >
                <Select.Value
                  className="min-w-0 flex-1 text-foreground text-sm"
                  numberOfLines={1}
                  placeholder={t('settings.websearch.provider.checkNoApiKeys')}
                >
                  {selectedApiKey?.label ?? t('settings.websearch.provider.checkNoApiKeys')}
                </Select.Value>
                <ChevronDownIcon className="size-4 text-default-foreground" strokeWidth={2} />
              </Select.Trigger>
              <Select.Portal>
                <Select.Overlay />
                <Select.Content
                  align="center"
                  className="max-h-48 p-2"
                  presentation="popover"
                  width={selectContentWidth}
                >
                  {apiKeyOptions.map((option) => (
                    <Select.Item key={option.value} label={option.label} value={option.value}>
                      <Select.ItemLabel className="flex-1 text-sm" numberOfLines={1} />
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Portal>
            </Select>
          </View>
          {checkResult ? (
            <Text className="px-1 text-danger text-sm">{checkResult.message}</Text>
          ) : null}
        </View>

        <SettingsDialogActionButton
          isDisabled={isChecking || !selectedApiKey}
          isFullWidth
          isLoading={isChecking}
          isPrimary
          label={
            isChecking
              ? t('settings.websearch.provider.checkChecking')
              : t('settings.websearch.provider.checkStart')
          }
          onPress={onStart}
        />
      </View>
    </BottomSheet>
  );
}
