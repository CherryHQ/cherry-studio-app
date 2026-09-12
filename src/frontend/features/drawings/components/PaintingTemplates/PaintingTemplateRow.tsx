import { ContentState, Image, Section } from '@cherrystudio/ui/components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PaintingTemplateBottomSheet } from './PaintingTemplateBottomSheet';
import {
  getPaintingTemplates,
  type PaintingTemplate,
  shufflePaintingTemplates,
} from './paintingTemplates';

type PaintingTemplateRowProps = {
  onUseTemplate: (template: PaintingTemplate) => void;
};

export function PaintingTemplateRow({ onUseTemplate }: PaintingTemplateRowProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const {
    data: templates,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['painting-templates', language],
    queryFn: ({ signal }) => getPaintingTemplates(language, signal),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  if (!templates) {
    return (
      <View className="px-4 py-6">
        {isPending ? (
          <ContentState.Loading title={t('painting.templates.loading')} />
        ) : (
          <ContentState.Error
            title={t('painting.templates.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
          />
        )}
      </View>
    );
  }

  return <PaintingTemplateRowContent onUseTemplate={onUseTemplate} templates={templates} />;
}

function PaintingTemplateRowContent({
  onUseTemplate,
  templates,
}: PaintingTemplateRowProps & { templates: PaintingTemplate[] }) {
  const { t } = useTranslation();
  const [templateOrder] = useState(() =>
    shufflePaintingTemplates(templates).map((template) => template.id),
  );
  const ranks = new Map(templateOrder.map((id, index) => [id, index]));
  const orderedTemplates = [...templates].sort(
    (left, right) => (ranks.get(left.id) ?? Infinity) - (ranks.get(right.id) ?? Infinity),
  );
  const [selectedTemplate, setSelectedTemplate] = useState<PaintingTemplate | null>(null);

  const handleDismiss = useCallback(() => {
    setSelectedTemplate(null);
  }, []);

  const handleUse = useCallback(
    (template: PaintingTemplate) => {
      setSelectedTemplate(null);
      onUseTemplate(template);
    },
    [onUseTemplate],
  );

  return (
    <>
      <View className="gap-3 pb-5" testID="painting-template-row">
        <View className="px-4">
          <Section.Header title={t('painting.templates.title')} />
        </View>
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {orderedTemplates.map((template) => (
            <Pressable
              accessibilityLabel={t('painting.templates.item', { title: template.title })}
              accessibilityRole="button"
              className="overflow-hidden rounded-lg border-continuous bg-secondary active:opacity-70"
              key={template.id}
              onPress={() => setSelectedTemplate(template)}
              style={styles.card}
              testID={`painting-template-card-${template.id}`}
            >
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                source={template.preview}
                style={styles.image}
                transition={120}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {selectedTemplate ? (
        <PaintingTemplateBottomSheet
          onDismiss={handleDismiss}
          onUse={handleUse}
          template={selectedTemplate}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 148,
    width: 112,
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
