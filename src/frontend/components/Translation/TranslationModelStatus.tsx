import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { TranslationSurface } from '@/shared/contracts/translation';

import { useTranslationAvailability } from './useTranslationAvailability';

export function TranslationModelStatus({ surface }: { surface: TranslationSurface }) {
  const { t } = useTranslation();
  const availability = useTranslationAvailability(surface);
  return (
    <View className="gap-1 px-1">
      <Text className="text-foreground text-sm">
        {availability?.model
          ? `${availability.model.name} · ${availability.model.providerName}`
          : t('translation.noModel')}
      </Text>
      <Text className="text-muted-foreground text-xs">
        {!availability
          ? t('common.loading')
          : availability.status === 'ready'
            ? t('translation.available')
            : t(`translation.error.${availability.reason}`)}
      </Text>
    </View>
  );
}
