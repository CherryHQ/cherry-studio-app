import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import { Button } from 'heroui-native/button';
import { XIcon } from 'lucide-uniwind/png';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from '@/components/nativePrimitives';
import {
  isLiquidGlassAvailable,
  paintingSheetOuterInset,
  sheetScrimColor,
} from '@/config/constants';

import type { PaintingTemplate } from './paintingTemplates';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;
const HEADER_HEIGHT = 60;
const HEADER_SIDE_WIDTH = 44;
const SHEET_CONTENT_INSET = 8;
const SHEET_CORNER_RADIUS = 28;

type CloseIntent = 'dismiss' | 'use';

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
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [sheetIndex, setSheetIndex] = useState(OPEN_INDEX);
  const [isApplying, setIsApplying] = useState(false);
  const closeIntentRef = useRef<CloseIntent | undefined>(undefined);
  const didFinishRef = useRef(false);
  const sheetWidth = Math.max(0, windowWidth - paintingSheetOuterInset * 2);
  const previewWidth = Math.max(
    0,
    Math.min(windowWidth * 0.5, sheetWidth - SHEET_CONTENT_INSET * 2, 220),
  );
  const promptPanelBottomPadding = Math.max(
    SHEET_CONTENT_INSET,
    insets.bottom - paintingSheetOuterInset - SHEET_CONTENT_INSET,
  );
  const sheetBottomCornerRadius = Math.max(
    SHEET_CORNER_RADIUS,
    insets.bottom + paintingSheetOuterInset,
  );
  const sheetTopCornerRadius = Math.max(
    SHEET_CORNER_RADIUS,
    sheetBottomCornerRadius - paintingSheetOuterInset,
  );
  const promptPanelRadius = sheetBottomCornerRadius - SHEET_CONTENT_INSET;
  const sheetCornerStyle = {
    borderBottomLeftRadius: sheetBottomCornerRadius,
    borderBottomRightRadius: sheetBottomCornerRadius,
    borderTopLeftRadius: sheetTopCornerRadius,
    borderTopRightRadius: sheetTopCornerRadius,
  };
  const headerInset = Math.max(0, sheetTopCornerRadius - HEADER_SIDE_WIDTH / 2);
  const headerStyle = {
    height: Math.max(HEADER_HEIGHT, headerInset + HEADER_SIDE_WIDTH),
    paddingHorizontal: headerInset,
    paddingTop: headerInset,
  };
  const requestClose = useCallback(() => {
    if (closeIntentRef.current) {
      return;
    }
    closeIntentRef.current = 'dismiss';
    setSheetIndex(CLOSED_INDEX);
  }, []);

  const requestUse = useCallback(() => {
    if (closeIntentRef.current) {
      return;
    }
    closeIntentRef.current = 'use';
    setIsApplying(true);
    setSheetIndex(CLOSED_INDEX);
  }, []);

  const handleIndexChange = useCallback((nextIndex: number) => {
    if (nextIndex === CLOSED_INDEX && !closeIntentRef.current) {
      closeIntentRef.current = 'dismiss';
    }
    setSheetIndex(nextIndex);
  }, []);

  const handleSettle = useCallback(
    (nextIndex: number) => {
      if (nextIndex !== CLOSED_INDEX || didFinishRef.current) {
        return;
      }
      didFinishRef.current = true;
      if (closeIntentRef.current === 'use') {
        onUse(template);
        return;
      }
      onDismiss();
    },
    [onDismiss, onUse, template],
  );

  const closeButton = (
    <Pressable
      accessibilityLabel={t('painting.templates.close')}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      disabled={isApplying}
      hitSlop={8}
      onPress={requestClose}
      testID="painting-template-close"
    >
      <XIcon className="size-5 text-foreground" strokeWidth={2.25} />
    </Pressable>
  );

  return (
    <ModalBottomSheet
      detents={[0, 'content']}
      index={sheetIndex}
      onIndexChange={handleIndexChange}
      onSettle={handleSettle}
      scrimColor={sheetScrimColor}
    >
      <View style={styles.sheetLayout}>
        <View
          style={[styles.sheet, sheetCornerStyle, { width: sheetWidth }]}
          testID="painting-template-sheet"
        >
          {isLiquidGlassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              style={[styles.surface, sheetCornerStyle]}
              testID="painting-template-sheet-surface"
            />
          ) : (
            <View
              className="bg-background"
              style={[styles.surface, sheetCornerStyle]}
              testID="painting-template-sheet-surface"
            />
          )}

          <View
            className="flex-row items-center"
            style={headerStyle}
            testID="painting-template-header"
          >
            {isLiquidGlassAvailable ? (
              <GlassView
                glassEffectStyle="regular"
                isInteractive={!isApplying}
                style={[styles.headerSide, styles.closeSurface]}
                testID="painting-template-close-glass"
              >
                {closeButton}
              </GlassView>
            ) : (
              <View
                className="bg-surface-secondary"
                style={[styles.headerSide, styles.closeSurface]}
              >
                {closeButton}
              </View>
            )}
            <Text
              className="flex-1 px-3 text-center font-semibold text-foreground text-base"
              numberOfLines={1}
              testID="painting-template-author"
            >
              {template.author ?? ''}
            </Text>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.headerSide}
              testID="painting-template-header-right-slot"
            />
          </View>

          <View style={styles.bodyContent} testID="painting-template-sheet-body">
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

            <View
              className="w-full gap-4 bg-surface-secondary px-4 pt-4"
              style={[
                styles.promptPanel,
                {
                  borderRadius: promptPanelRadius,
                  paddingBottom: promptPanelBottomPadding,
                },
              ]}
              testID="painting-template-prompt-panel"
            >
              <Text
                className="text-center text-foreground text-base leading-6"
                ellipsizeMode="tail"
                numberOfLines={2}
                selectable
                testID="painting-template-prompt"
              >
                {template.prompt}
              </Text>
              <Button
                accessibilityLabel={t('painting.templates.try')}
                className="w-full rounded-full"
                isDisabled={isApplying}
                onPress={requestUse}
                size="sm"
                testID="painting-template-try"
              >
                <Button.Label className="font-semibold text-base">
                  {t('painting.templates.try')}
                </Button.Label>
              </Button>
            </View>
          </View>
        </View>
        <View style={styles.sheetBottomGap} testID="painting-template-sheet-bottom-gap" />
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  bodyContent: {
    alignItems: 'center',
    gap: 24,
    paddingBottom: SHEET_CONTENT_INSET,
    paddingHorizontal: SHEET_CONTENT_INSET,
    paddingTop: 12,
  },
  closeSurface: {
    borderCurve: 'continuous',
    borderRadius: HEADER_SIDE_WIDTH / 2,
    overflow: 'hidden',
  },
  headerSide: {
    height: HEADER_SIDE_WIDTH,
    width: HEADER_SIDE_WIDTH,
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
  sheet: {
    borderCurve: 'continuous',
    borderRadius: SHEET_CORNER_RADIUS,
    overflow: 'hidden',
  },
  sheetBottomGap: {
    height: paintingSheetOuterInset,
  },
  sheetLayout: {
    alignItems: 'center',
  },
  surface: {
    borderCurve: 'continuous',
    borderRadius: SHEET_CORNER_RADIUS,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
