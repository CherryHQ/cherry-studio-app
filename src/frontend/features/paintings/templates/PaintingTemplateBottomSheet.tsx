import {
  BottomSheet,
  type BottomSheetCloseReason,
  Button,
  Image,
  useBottomSheet,
} from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
  const { t } = useTranslation();
  // The "try" button closes with a `'use'` reason so the template is applied
  // only once the closing animation has settled; every other close dismisses.
  const handleClose = useCallback(
    (reason: BottomSheetCloseReason) => {
      if (reason === 'use') {
        onUse(template);
        return;
      }
      onDismiss();
    },
    [onDismiss, onUse, template],
  );

  return (
    <BottomSheet
      closeAccessibilityLabel={t('painting.templates.close')}
      onClose={handleClose}
      testID="painting-template"
      title={
        <Text
          className="flex-1 px-3 text-center font-semibold text-foreground text-base"
          numberOfLines={1}
          testID="painting-template-author"
        >
          {template.author ?? ''}
        </Text>
      }
    >
      <PaintingTemplateSheetBody template={template} />
    </BottomSheet>
  );
}

function PaintingTemplateSheetBody({ template }: { template: PaintingTemplate }) {
  const { t } = useTranslation();
  const { geometry, isClosing, requestClose } = useBottomSheet();
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = Math.max(
    0,
    Math.min(windowWidth * 0.5, geometry.sheetWidth - SHEET_CONTENT_INSET * 2, 220),
  );
  // The button is the last thing in the card, so this padding is what keeps it
  // clear of the home indicator: `insets.bottom` measured from the screen's
  // bottom, minus the gap the card already leaves there.
  const bodyBottomPadding = Math.max(
    SHEET_CONTENT_INSET,
    geometry.insets.bottom - geometry.outerInset,
  );

  return (
    <View
      style={[styles.bodyContent, { paddingBottom: bodyBottomPadding }]}
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
        disabled={isClosing}
        onPress={() => requestClose('use')}
        size="sm"
        testID="painting-template-try"
      >
        <Button.Label className="font-semibold text-base">
          {t('painting.templates.try')}
        </Button.Label>
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyContent: {
    alignItems: 'center',
    gap: 24,
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
