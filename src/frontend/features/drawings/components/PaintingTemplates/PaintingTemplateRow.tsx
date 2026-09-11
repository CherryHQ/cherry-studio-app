import { Image, Section } from '@cherrystudio/ui/components';
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
  const templates = getPaintingTemplates(i18n.resolvedLanguage ?? i18n.language);
  const [templateOrder] = useState(() =>
    shufflePaintingTemplates(templates).map((template) => template.id),
  );
  const orderedTemplates = [...templates].sort(
    (left, right) => templateOrder.indexOf(left.id) - templateOrder.indexOf(right.id),
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
