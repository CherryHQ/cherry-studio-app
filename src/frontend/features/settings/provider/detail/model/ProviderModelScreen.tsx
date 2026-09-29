import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, Section, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import {
  ProviderModelSettings,
  useSavedModelSettings,
} from '../../models/components/ProviderModelSettings';
import { useProviderModelManagement } from '../../models/hooks/useProviderModelManagement';
import { ProviderModelPage } from './components/ProviderModelPage';

export default function ProviderModelScreen() {
  const { t } = useTranslation();
  return (
    <ProviderModelPage title={t('settings.provider.models.detail.title')}>
      {(model, provider) => <ModelDetails key={model.id} model={model} provider={provider} />}
    </ProviderModelPage>
  );
}

/**
 * The model's introduction stays as it was; everything below it is its settings, changed in
 * place and saved immediately, with the same rows the add-model screen uses.
 */
function ModelDetails({ model, provider }: { model: Model; provider: Provider }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const settings = useSavedModelSettings(model, provider);
  const management = useProviderModelManagement(provider.id, [model], [model], () => router.back());
  const purpose = t(
    isTextGenerationModel(model)
      ? 'settings.provider.models.section.chat'
      : isImageGenerationModel(model)
        ? 'settings.provider.models.section.painting'
        : 'settings.provider.models.detail.otherPurpose',
  );
  const copyModelId = async () => {
    try {
      await Clipboard.setStringAsync(model.modelId);
      toast.show({ label: t('settings.provider.models.detail.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.provider.models.detail.copyFailed'), variant: 'danger' });
    }
  };
  return (
    <SettingsScrollPage
      contentClassName="gap-6 pb-10"
      headerProps={{ title: t('settings.provider.models.detail.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-5 px-1">
        <View className="flex-row items-center gap-4">
          <ModelAvatar model={model} provider={provider} size={56} />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" className="font-semibold text-foreground text-2xl">
              {model.name}
            </Text>
            <Text className="text-muted-foreground text-sm">
              {provider.name} · {purpose}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2 rounded-xl bg-secondary py-1 pr-1 pl-4">
          <View className="min-w-0 flex-1 gap-1 py-2">
            <Text className="text-muted-foreground text-xs">
              {t('settings.provider.models.detail.modelId')}
            </Text>
            <Text className="font-mono text-foreground text-sm">{model.modelId}</Text>
          </View>
          <Button
            accessibilityLabel={t('settings.provider.models.detail.copyId')}
            icon={<CopyIcon />}
            onPress={() => void copyModelId()}
            size="lg"
            variant="ghost"
          />
        </View>
        {model.description?.trim() ? (
          <Text className="text-muted-foreground text-sm">{model.description}</Text>
        ) : null}
      </View>

      <ProviderModelSettings value={settings} />

      <Section>
        <Section.Item
          destructive
          disabled={management.isDeleting || settings.disabled}
          label={t('settings.provider.models.detail.delete')}
          onPress={() => management.requestDelete([model])}
          showChevron={false}
          testID="model-delete"
        />
      </Section>
    </SettingsScrollPage>
  );
}
