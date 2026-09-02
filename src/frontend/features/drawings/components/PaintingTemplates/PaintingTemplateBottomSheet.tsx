import { BottomSheet, Button, Image } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { PaintingTemplate } from './paintingTemplates';

const SHEET_CONTENT_INSET = 8;

type PaintingTemplateBottomSheetProps = {
  onDismiss: () => void;
  onUse: (template: PaintingTemplate) => void;
  template: PaintingTemplate;
};

export function PaintingTemplateBottomSheet({
  onDismiss,
  onUse,
  template,
}: PaintingTemplateBottomSheetProps) {
  return (
    <BottomSheet
      onClose={onDismiss}
      open
      size="medium"
      testID="painting-template"
      title={template.author ?? ''}
    >
      <PaintingTemplateSheetBody onUse={onUse} template={template} />
    </BottomSheet>
  );
}

function PaintingTemplateSheetBody({
  onUse,
  template,
}: {
  onUse: (template: PaintingTemplate) => void;
  template: PaintingTemplate;
}) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.max(0, Math.min(windowWidth * 0.5, windowWidth - 32, 220));

  return (
    <ScrollView
      contentContainerStyle={styles.bodyContent}
      showsVerticalScrollIndicator={false}
      testID="painting-template-sheet-body"
    >
      <View style={[styles.preview, { height: (previewWidth * 4) / 3, width: previewWidth }]}>
        <Image
          accessibilityLabel={template.title}
          cachePolicy="memory-disk"
          contentFit="cover"
          source={template.preview}
          style={styles.previewImage}
          testID="painting-template-sheet-image"
          transition={180}
        />
      </View>

      {/* The panel floats between the preview and the button, touching no card
          edge, so it has nothing to be concentric with and takes a flat radius
          on all four corners rather than tracking the card's. */}
      <View
        className="w-full rounded-xl bg-secondary p-4"
        style={styles.promptPanel}
        testID="painting-template-prompt-panel"
      >
        <Text
          className="text-center text-foreground text-base"
          ellipsizeMode="tail"
          numberOfLines={2}
          selectable
          testID="painting-template-prompt"
        >
          {template.prompt}
        </Text>
      </View>

      {/* Stretch-minus-margin rather than `w-full`: the margin has to come off
          the width, and `w-full` would resolve to the body's full content box
          and overflow by exactly the margin. The 16 matches the panel's own
          padding, so the button's edges line up with the prompt text above it. */}
      <Button
        accessibilityLabel={t('painting.templates.try')}
        className="mx-4 self-stretch rounded-full"
        onPress={() => onUse(template)}
        size="sm"
        testID="painting-template-try"
      >
        <Button.Label className="font-semibold text-base">
          {t('painting.templates.try')}
        </Button.Label>
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bodyContent: {
    alignItems: 'center',
    gap: 24,
    paddingBottom: 24,
    paddingHorizontal: SHEET_CONTENT_INSET,
    paddingTop: 12,
  },
  preview: {
    borderCurve: 'continuous',
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  promptPanel: {
    borderCurve: 'continuous',
  },
});
