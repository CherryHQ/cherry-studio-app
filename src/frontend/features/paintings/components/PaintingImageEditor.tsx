/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import {
  Button,
  ContentState,
  getComposerKeyboardStickyOffset,
  Image,
} from '@cherrystudio/ui/components';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/frontend/appShell/header';
import {
  ComposerDock,
  useComposerMeta,
  useComposerPresentationState,
} from '@/frontend/components/Composer';
import {
  PaintingImageInput,
  usePaintingParameterDraft,
  type PaintingInputSubmission,
} from '@/frontend/components/PaintingInput';
import type { Painting } from '@/shared/data/types/painting';
import { parseImageRatio, type ImageParamDraft } from '@/shared/utils/imageGenerationParams';

import { usePaintingAnnotationDraft } from '../hooks/usePaintingAnnotationDraft';
import { fitPaintingImage, type PaintingAnnotation } from '../utils/paintingAnnotations';

export function PaintingImageEditor({
  initialAnnotations,
  initialParamValues,
  onAnnotationsChange,
  onClose,
  onCancel,
  onGenerate,
  output,
  painting,
  status,
}: {
  initialAnnotations: readonly PaintingAnnotation[];
  initialParamValues?: ImageParamDraft;
  onAnnotationsChange: (annotations: readonly PaintingAnnotation[]) => void;
  onClose: () => void;
  onCancel: () => void;
  onGenerate: (input: PaintingInputSubmission) => Promise<unknown>;
  output: { fileEntryId?: string; uri: string };
  painting?: Painting;
  status: 'idle' | 'generating';
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const editing = usePaintingAnnotationDraft({
    initialAnnotations,
    onAnnotationsChange,
    onClose,
    onGenerate,
  });
  const { annotations, selectedId, isSubmitting } = editing;
  const { inputRef } = useComposerMeta();
  const { isKeyboardTrackingEnabled } = useComposerPresentationState();
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = getComposerKeyboardStickyOffset(insets.bottom);
  const dockHeight = useSharedValue(0);
  const canvasStyle = useAnimatedStyle(() => ({
    paddingBottom:
      dockHeight.get() +
      (isKeyboardTrackingEnabled
        ? Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset)
        : 0),
  }));
  const parameters = usePaintingParameterDraft();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [sourceRatio, setSourceRatio] = useState<number | null>(null);
  const [isImageFailed, setIsImageFailed] = useState(false);
  const selected = annotations.find((annotation) => annotation.id === selectedId);
  const focusFrameRef = useRef<number | null>(null);
  useLayoutEffect(
    () => () => {
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    },
    [],
  );
  const targetRatio =
    [
      parameters?.aspectRatio,
      parameters?.size,
      parameters?.imageResolution,
      parameters?.size === 'custom'
        ? `${parameters.customSize_width}x${parameters.customSize_height}`
        : undefined,
    ].flatMap((value) => {
      const dimensions = parseImageRatio(value);
      return dimensions ? [dimensions.width / dimensions.height] : [];
    })[0] ?? sourceRatio;
  const frame = targetRatio
    ? fitPaintingImage(bounds.width, bounds.height, targetRatio)
    : { ...bounds, left: 0, top: 0 };
  const image = sourceRatio
    ? fitPaintingImage(frame.width, frame.height, sourceRatio)
    : { ...frame, left: 0, top: 0 };
  function focusInput() {
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      // The native editor recreates its imperative handle on each render.
      // Read the committed handle; unmount cleanup cancels cross-screen focus.
      inputRef.current?.focus();
    });
  }

  const closeFromBack = useEffectEvent(editing.close);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFromBack();
      return true;
    });
    return () => listener.remove();
  }, []);

  return (
    <View className="absolute inset-0 z-50 bg-constant-black" accessibilityViewIsModal>
      <StatusBar style="light" />
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Math.max(insets.top, 12) }}
      >
        <HeaderIconButton
          accessibilityLabel={t('common.back')}
          disabled={isSubmitting}
          onPress={editing.close}
          className="bg-constant-white/10"
        >
          <ArrowLeftIcon className="size-5 text-constant-white" />
        </HeaderIconButton>
        <Text className="min-w-0 flex-1 font-medium text-constant-white text-base">
          {t('painting.editor.title')}
        </Text>
        {selected ? (
          <HeaderIconButton
            accessibilityLabel={t('painting.editor.removeAnnotation')}
            disabled={isSubmitting}
            onPress={editing.removeSelectedAnnotation}
          >
            <Trash2Icon className="size-5 text-constant-white" />
          </HeaderIconButton>
        ) : null}
      </View>
      <Animated.View className="min-h-0 flex-1 px-3" style={canvasStyle}>
        <View
          className="min-h-0 flex-1"
          onLayout={({ nativeEvent: { layout } }) =>
            setBounds((current) =>
              current.width === layout.width && current.height === layout.height
                ? current
                : { width: layout.width, height: layout.height },
            )
          }
        >
          {isImageFailed ? (
            <View className="absolute inset-0 items-center justify-center p-4">
              <View className="w-full rounded-2xl bg-card p-6">
                <ContentState.Error
                  title={t('fileViewer.previewFailed')}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => setIsImageFailed(false),
                  }}
                />
              </View>
            </View>
          ) : (
            <View
              className={
                targetRatio && sourceRatio && Math.abs(targetRatio - sourceRatio) > 0.01
                  ? 'absolute border border-constant-white/30'
                  : 'absolute'
              }
              style={frame}
            >
              <Pressable
                accessibilityLabel={t('painting.editor.addAnnotation')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmitting }}
                disabled={isSubmitting}
                className="absolute"
                style={image}
                onPress={({ nativeEvent }) => {
                  if (!sourceRatio || image.width <= 0 || image.height <= 0) return;
                  editing.addAnnotation(
                    Math.max(0, Math.min(1, nativeEvent.locationX / image.width)),
                    Math.max(0, Math.min(1, nativeEvent.locationY / image.height)),
                  );
                  focusInput();
                }}
              >
                <Image
                  onError={() => setIsImageFailed(true)}
                  source={output.uri}
                  contentFit="contain"
                  onLoad={({ source }) => {
                    if (source.width > 0 && source.height > 0)
                      setSourceRatio(source.width / source.height);
                  }}
                  style={{ height: '100%', width: '100%' }}
                />
                {annotations.map((annotation) => (
                  <Pressable
                    key={annotation.id}
                    accessibilityLabel={t('painting.editor.annotation', {
                      number: annotation.id,
                    })}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: isSubmitting,
                      selected: annotation.id === selectedId,
                    }}
                    disabled={isSubmitting}
                    hitSlop={8}
                    className={
                      annotation.id === selectedId
                        ? 'absolute size-8 items-center justify-center rounded-2xl border-2 border-constant-white bg-primary'
                        : 'absolute size-8 items-center justify-center rounded-2xl border border-constant-white bg-primary'
                    }
                    style={{
                      left: annotation.x * image.width - 16,
                      top: annotation.y * image.height - 16,
                    }}
                    onPress={(event) => {
                      event.stopPropagation();
                      editing.selectAnnotation(annotation.id);
                      focusInput();
                    }}
                  >
                    <Text className="font-semibold text-primary-foreground text-xs">
                      {annotation.id}
                    </Text>
                  </Pressable>
                ))}
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
      <ComposerDock onHeightChange={(height) => dockHeight.set(height)}>
        <View className="gap-2 pb-2">
          <Text className="text-center text-constant-white/60 text-xs">
            {t('painting.editor.annotationHint')}
          </Text>
          {annotations.length > 0 ? (
            <ScrollView
              horizontal
              contentContainerClassName="items-center gap-1"
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Button
                accessibilityState={{ selected: selectedId === null }}
                disabled={isSubmitting}
                onPress={() => editing.selectAnnotation(null)}
                size="sm"
                variant="ghost"
              >
                <Text
                  className={
                    selectedId === null
                      ? 'font-medium text-sm text-constant-white'
                      : 'font-medium text-sm text-constant-white/60'
                  }
                >
                  {t('painting.editor.wholeImage')}
                </Text>
              </Button>
              {annotations.map((annotation) => (
                <Button
                  key={annotation.id}
                  accessibilityState={{ selected: annotation.id === selectedId }}
                  disabled={isSubmitting}
                  onPress={() => {
                    editing.selectAnnotation(annotation.id);
                    focusInput();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <Text
                    className={
                      annotation.id === selectedId
                        ? 'font-medium text-sm text-constant-white'
                        : 'font-medium text-sm text-constant-white/60'
                    }
                  >
                    {t('painting.editor.annotation', { number: annotation.id })}
                  </Text>
                </Button>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <PaintingImageInput
          canSend={isImageFailed ? false : undefined}
          initialParamValues={initialParamValues}
          placeholder={
            selectedId === null
              ? t('painting.editor.wholeImage')
              : t('painting.editor.annotationPlaceholder', { number: selectedId })
          }
          onCancel={onCancel}
          preparePrompt={editing.preparePrompt}
          onGenerate={editing.generate}
          painting={painting}
          status={status}
        />
      </ComposerDock>
    </View>
  );
}
