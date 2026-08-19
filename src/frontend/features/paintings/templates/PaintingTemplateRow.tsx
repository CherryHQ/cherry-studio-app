import { Image, Section } from '@cherrystudio/ui/components';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PaintingTemplateBottomSheet } from './PaintingTemplateBottomSheet';
import { type PaintingTemplate, paintingTemplates } from './paintingTemplates';

type PaintingTemplateRowProps = {
  onUseTemplate: (template: PaintingTemplate) => void;
};

export function PaintingTemplateRow({ onUseTemplate }: PaintingTemplateRowProps) {
  const { t } = useTranslation();
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
        <Section.Header className="px-4" title={t('painting.templates.title')} />
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {paintingTemplates.map((template) => (
            <Pressable
              accessibilityLabel={t('painting.templates.item', { title: template.title })}
              accessibilityRole="button"
              className="overflow-hidden bg-secondary active:opacity-70"
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
    borderCurve: 'continuous',
    borderRadius: 8,
    height: 148,
    width: 112,
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
