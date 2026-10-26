import { ContentState, Image, Spinner } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';

import { usePaintingTemplates } from '../hooks/usePaintingTemplates';
import { setPaintingTemplateOrigin } from '../utils/paintingTemplateOrigin';
import type { PaintingTemplate } from '../utils/paintingTemplates';
import { GallerySectionHeader } from './GallerySectionHeader';

const cardWidth = 100;
const cardHeight = 134;

/** One compact row of templates; a card or "All" opens the template stage. */
export function PaintingTemplateStrip() {
  const { t } = useTranslation();
  const router = useRouter();
  const templates = usePaintingTemplates();
  const openStage = useCallback(
    (templateId?: string) =>
      router.push({ params: templateId ? { templateId } : {}, pathname: '/drawings/templates' }),
    [router],
  );

  return (
    <View className="gap-3">
      <GallerySectionHeader
        action={{
          label: t('painting.templates.all'),
          onPress: () => openStage(),
          testID: 'painting-templates-all',
        }}
        title={t('painting.templates.title')}
      />
      {templates.data ? (
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="painting-template-strip"
        >
          {templates.data.map((template) => (
            <TemplateCard key={template.id} onOpen={openStage} template={template} />
          ))}
        </ScrollView>
      ) : templates.isPending ? (
        <View className="items-center justify-center" style={{ height: cardHeight }}>
          <Spinner
            accessibilityLabel={t('painting.templates.loading')}
            accessibilityRole="progressbar"
          />
        </View>
      ) : (
        <View className="px-4 py-2">
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void templates.refetch() }}
            title={t('painting.templates.loadFailed')}
          />
        </View>
      )}
    </View>
  );
}

function TemplateCard({
  onOpen,
  template,
}: {
  onOpen: (templateId: string) => void;
  template: PaintingTemplate;
}) {
  const { t } = useTranslation();
  const imageRef = useRef<ViewInstance>(null);
  const open = () => {
    const image = imageRef.current;
    if (!image) {
      onOpen(template.id);
      return;
    }
    // The stage grows the card out of where it sits now.
    image.measureInWindow((x, y, width, height) => {
      setPaintingTemplateOrigin({ height, templateId: template.id, width, x, y });
      onOpen(template.id);
    });
  };

  return (
    <Pressable
      accessibilityLabel={t('painting.templates.item', { title: template.title })}
      accessibilityRole="button"
      className="gap-1.5 active:opacity-75"
      onPress={open}
      style={{ width: cardWidth }}
      testID={`painting-template-${template.id}`}
    >
      <View
        className="overflow-hidden rounded-xl border border-border-subtle bg-secondary"
        ref={imageRef}
        style={{ height: cardHeight }}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          source={template.preview}
          style={{ height: '100%', width: '100%' }}
        />
      </View>
      <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
        {template.title}
      </Text>
    </Pressable>
  );
}
