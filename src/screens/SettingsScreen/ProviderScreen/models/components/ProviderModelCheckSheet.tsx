import { Select } from 'heroui-native';
import { Dialog } from 'heroui-native/dialog';
import { ChevronDownIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { Model, UniqueModelId } from '@/data/types/model';
import { SettingsDialogActionButton } from '../../../components/SettingsDialogActionButton';
import type { ProviderModelCheckApiKeyOption } from '../hooks/useProviderModelCheck';

const selectContentWidth = 256;

type ProviderModelCheckSheetProps = {
  apiKeyOptions: ProviderModelCheckApiKeyOption[];
  isChecking: boolean;
  isOpen: boolean;
  models: Model[];
  onApiKeyChange: (apiKeyId: string) => void;
  onClose: () => void;
  onModelChange: (modelId: UniqueModelId) => void;
  onStart: () => Promise<void> | void;
  selectedApiKeyId: string;
  selectedModelId: UniqueModelId | null;
};

export function ProviderModelCheckSheet({
  apiKeyOptions,
  isChecking,
  isOpen,
  models,
  onApiKeyChange,
  onClose,
  onModelChange,
  onStart,
  selectedApiKeyId,
  selectedModelId,
}: ProviderModelCheckSheetProps) {
  const { t } = useTranslation();
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const selectedApiKey = useMemo(
    () => apiKeyOptions.find((option) => option.value === selectedApiKeyId) ?? apiKeyOptions[0],
    [apiKeyOptions, selectedApiKeyId],
  );
  const selectedModelOption = selectedModel
    ? { label: selectedModel.name, value: selectedModel.id }
    : undefined;
  const selectedApiKeyOption = selectedApiKey
    ? { label: selectedApiKey.label, value: selectedApiKey.value }
    : undefined;
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onClose();
      }
    },
    [onClose],
  );
  const handleModelValueChange = useCallback(
    (nextOption?: { value: string }) => {
      const nextModel = models.find((model) => model.id === nextOption?.value);
      if (nextModel) {
        onModelChange(nextModel.id);
      }
    },
    [models, onModelChange],
  );
  const handleApiKeyValueChange = useCallback(
    (nextOption?: { value: string }) => {
      if (nextOption?.value) {
        onApiKeyChange(nextOption.value);
      }
    },
    [onApiKeyChange],
  );

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay isCloseOnPress={!isChecking} />
        <Dialog.Content
          className="w-[92%] max-w-[420px] gap-5 rounded-3xl bg-overlay p-5"
          isSwipeable={false}
        >
          <View className="gap-1">
            <Dialog.Title>{t('settings.provider.models.checkTitle')}</Dialog.Title>
          </View>

          <View className="gap-4">
            <View className="gap-2">
              <Text className="px-1 font-medium text-default-foreground text-sm">
                {t('settings.provider.models.checkModelSection')}
              </Text>
              <Select value={selectedModelOption} onValueChange={handleModelValueChange}>
                <Select.Trigger
                  accessibilityLabel={t('settings.provider.models.checkModelSection')}
                  className="flex-row items-center rounded-xl bg-settings-grouped-surface px-3 py-2 shadow-none"
                >
                  <Select.Value
                    className="min-w-0 flex-1 text-sm leading-5 text-foreground"
                    numberOfLines={1}
                    placeholder={t('settings.provider.models.checkNoModels')}
                  >
                    {selectedModel?.name ?? t('settings.provider.models.checkNoModels')}
                  </Select.Value>
                  <ChevronDownIcon className="size-4 text-default-foreground" strokeWidth={2} />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Overlay />
                  <Select.Content
                    align="center"
                    className="max-h-56 p-2"
                    presentation="popover"
                    width={selectContentWidth}
                  >
                    {models.map((model) => (
                      <Select.Item key={model.id} label={model.name} value={model.id}>
                        <Select.ItemLabel className="flex-1 text-sm" numberOfLines={1} />
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Portal>
              </Select>
            </View>

            <View className="gap-2">
              <Text className="px-1 font-medium text-default-foreground text-sm">
                {t('settings.provider.models.checkApiKeySection')}
              </Text>
              <Select value={selectedApiKeyOption} onValueChange={handleApiKeyValueChange}>
                <Select.Trigger
                  accessibilityLabel={t('settings.provider.models.checkApiKeySection')}
                  className="flex-row items-center rounded-xl bg-settings-grouped-surface px-3 py-2 shadow-none"
                >
                  <Select.Value
                    className="min-w-0 flex-1 text-sm leading-5 text-foreground"
                    numberOfLines={1}
                    placeholder={t('settings.select.placeholder')}
                  >
                    {selectedApiKey?.label ?? t('settings.select.placeholder')}
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
          </View>

          <View className="flex-row justify-end gap-3">
            <SettingsDialogActionButton
              isDisabled={isChecking}
              label={t('common.close')}
              onPress={onClose}
            />
            <SettingsDialogActionButton
              isDisabled={isChecking || !selectedModel}
              isPrimary
              isLoading={isChecking}
              label={
                isChecking
                  ? t('settings.provider.models.checkChecking')
                  : t('settings.provider.models.checkStart')
              }
              onPress={onStart}
            />
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
