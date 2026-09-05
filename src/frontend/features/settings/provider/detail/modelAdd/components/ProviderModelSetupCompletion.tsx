import { Button, ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export function ProviderModelSetupCompletion({
  isEnabling,
  onComplete,
  onConfigure,
  onAddModel,
}: {
  isEnabling: boolean;
  onComplete: () => Promise<void>;
  onConfigure: () => void;
  onAddModel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-4 px-6 py-10">
      <ContentState.Empty
        title={t('settings.provider.setup.modelsSaved')}
        description={t('settings.provider.setup.finishDescription')}
        secondaryAction={{
          children: t('settings.provider.models.syncRecovery.configure'),
          disabled: isEnabling,
          onPress: onConfigure,
        }}
        primaryAction={{
          children: t(
            isEnabling
              ? 'settings.provider.setup.preparing'
              : 'settings.provider.models.completeSetup',
          ),
          disabled: isEnabling,
          onPress: () => void onComplete(),
        }}
      />
      <Button disabled={isEnabling} onPress={onAddModel} variant="ghost">
        {t('settings.provider.models.addTitle')}
      </Button>
    </View>
  );
}
