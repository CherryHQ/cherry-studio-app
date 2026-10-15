import { BottomSheet, Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { Painting } from '@/shared/data/types/painting';

/** What produced the focused image: the request as the user wrote it, the model, and when. */
export function PaintingGenerationInfoSheet({
  modelName,
  onDismiss,
  painting,
}: {
  modelName: string | undefined;
  onDismiss: () => void;
  painting: Painting;
}) {
  const { i18n, t } = useTranslation();
  const createdAt = new Date(painting.createdAt).toLocaleString(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <BottomSheet
      closeAction={{ accessibilityLabel: t('common.close') }}
      onClose={onDismiss}
      open
      size="medium"
      testID="painting-generation-info"
      title={t('painting.focus.info.title')}
    >
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-2">
        <View className="gap-2">
          <Text className="font-medium text-muted-foreground text-xs">
            {t('painting.focus.info.prompt')}
          </Text>
          <Text className="text-base text-foreground" selectable>
            {painting.brief ?? painting.prompt}
          </Text>
        </View>
        <Section>
          <Section.Item
            label={t('painting.focus.info.model')}
            trailing={
              <Text className="max-w-56 text-base text-foreground" numberOfLines={1}>
                {modelName ?? t('painting.focus.info.unknownModel')}
              </Text>
            }
          />
          <Section.Item
            label={t('painting.focus.info.createdAt')}
            trailing={<Text className="text-base text-foreground">{createdAt}</Text>}
          />
        </Section>
      </ScrollView>
    </BottomSheet>
  );
}
