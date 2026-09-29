import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

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
 * The model's avatar and name, then its settings, changed in place and saved immediately, with
 * the same rows the add-model screen uses. The model ID leads those rows.
 */
function ModelDetails({ model, provider }: { model: Model; provider: Provider }) {
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useSavedModelSettings(model, provider);
  const management = useProviderModelManagement(provider.id, [model], [model], () => router.back());
  return (
    <SettingsScrollPage
      contentClassName="gap-6 pb-10"
      headerProps={{ title: t('settings.provider.models.detail.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-4 px-1">
        <View className="flex-row items-center gap-4">
          <ModelAvatar model={model} provider={provider} size={56} />
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 font-semibold text-foreground text-2xl"
          >
            {model.name}
          </Text>
        </View>
        {model.description?.trim() ? (
          <Text className="text-muted-foreground text-sm">{model.description}</Text>
        ) : null}
      </View>

      <ProviderModelSettings value={settings} />

      <Section>
        <Section.Item
          destructive
          disabled={management.isDeleting}
          label={t('settings.provider.models.detail.delete')}
          onPress={() => management.requestDelete([model])}
          showChevron={false}
          testID="model-delete"
        />
      </Section>
    </SettingsScrollPage>
  );
}
