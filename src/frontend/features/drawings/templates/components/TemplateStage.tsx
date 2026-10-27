import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import { Button, Image } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import { useComposerActions } from '@/frontend/components/Composer';

import type { PaintingTemplateOrigin } from '../../utils/paintingTemplateOrigin';
import {
  PAINTING_TEMPLATE_CATEGORIES,
  type PaintingTemplate,
  type PaintingTemplateCategory,
} from '../../utils/paintingTemplates';
import { TemplateUsePanel } from './TemplateUsePanel';

type Category = 'all' | PaintingTemplateCategory;

const categoryLabelKeys = {
  all: 'painting.templates.category.all',
  cute: 'painting.templates.category.cute',
  illustration: 'painting.templates.category.illustration',
  portrait: 'painting.templates.category.portrait',
  poster: 'painting.templates.category.poster',
  space: 'painting.templates.category.space',
} as const satisfies Record<Category, string>;

const cardAspect = 16 / 9;
const cardGap = 14;
const sideScale = 0.84;
const sideOpacity = 0.5;
const dismissDistance = 120;
const dismissVelocity = 900;
const enterDuration = 340;
const exitDuration = 280;
const modeDuration = 320;
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);

/**
 * The template stage. Motion contract: opening grows the tapped card out of
 * its place in the gallery and the backdrop fades in; pulling the card down
 * follows the finger and, past a threshold or with a flick, shrinks it back to
 * where it came from (any other template fades away instead); "Use template"
 * moves the same card up to make room for its fields rather than opening a
 * page. Every transition starts from the current frame, so a new gesture can
 * take over mid-flight. With Reduce Motion the stage appears, switches, and
 * closes without travel.
 */
export function TemplateStage({
  initialTemplateId,
  onClose,
  origin,
  templates,
}: {
  initialTemplateId: string | undefined;
  onClose: () => void;
  origin: PaintingTemplateOrigin | undefined;
  templates: readonly PaintingTemplate[];
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { clearAttachments } = useComposerActions();
  const [category, setCategory] = useState<Category>('all');
  const [listStart] = useState(() =>
    Math.max(
      0,
      templates.findIndex((template) => template.id === initialTemplateId),
    ),
  );
  const [index, setIndex] = useState(listStart);
  const [listInitialIndex, setListInitialIndex] = useState(listStart);
  const [mode, setMode] = useState<'browse' | 'use'>('browse');
  const visibleTemplates = useMemo(
    () =>
      category === 'all'
        ? templates
        : templates.filter((template) => template.category === category),
    [category, templates],
  );
  const current = visibleTemplates[Math.min(index, visibleTemplates.length - 1)];

  const tabsTop = insets.top + 8;
  const cardTop = tabsTop + 56;
  // Title, summary, and the action sit right under the card; the card takes the rest.
  const footerHeight = 180 + Math.max(insets.bottom, 16);
  const cardHeight = Math.min(
    screenWidth * 0.7 * cardAspect,
    screenHeight - cardTop - footerHeight,
  );
  const cardWidth = cardHeight / cardAspect;
  const snap = cardWidth + cardGap;
  const useCardHeight = Math.min(cardHeight * 0.55, screenHeight * 0.3);
  const useCardTop = insets.top + 60;
  const panelTop = useCardTop + useCardHeight + 16;

  const scrollX = useSharedValue(listStart * snap);
  const presence = useSharedValue(reducedMotion ? 1 : 0);
  const drag = useSharedValue(0);
  const useProgress = useSharedValue(0);
  const isOriginCurrent = useSharedValue(origin?.templateId === current?.id ? 1 : 0);

  useEffect(() => {
    isOriginCurrent.set(origin && current && origin.templateId === current.id ? 1 : 0);
  }, [current, isOriginCurrent, origin]);
  useEffect(() => {
    if (!reducedMotion) presence.set(withTiming(1, { duration: enterDuration, easing: easeOut }));
  }, [presence, reducedMotion]);

  const updateIndex = useCallback(
    (next: number) => setIndex(Math.max(0, Math.min(next, visibleTemplates.length - 1))),
    [visibleTemplates.length],
  );
  useAnimatedReaction(
    () => Math.round(scrollX.get() / snap),
    (next, previous) => {
      if (previous !== null && next !== previous) scheduleOnRN(updateIndex, next);
    },
  );
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      onClose();
      return;
    }
    drag.set(withTiming(0, { duration: exitDuration, easing: easeInOut }));
    presence.set(
      withTiming(0, { duration: exitDuration, easing: easeInOut }, (finished) => {
        if (finished) scheduleOnRN(onClose);
      }),
    );
  }, [drag, onClose, presence, reducedMotion]);
  const enterUse = useCallback(() => {
    setMode('use');
    useProgress.set(reducedMotion ? 1 : withTiming(1, { duration: modeDuration, easing: easeOut }));
  }, [reducedMotion, useProgress]);
  const exitUse = useCallback(() => {
    clearAttachments();
    setMode('browse');
    useProgress.set(reducedMotion ? 0 : withTiming(0, { duration: modeDuration, easing: easeOut }));
  }, [clearAttachments, reducedMotion, useProgress]);
  const selectCategory = useCallback(
    (next: Category) => {
      setCategory(next);
      setListInitialIndex(0);
      setIndex(0);
      scrollX.set(0);
    },
    [scrollX],
  );

  // A route pushed from the stage, such as provider setup, keeps back for itself.
  useFocusedBackPress(() => {
    if (mode === 'use') exitUse();
    else dismiss();
  });

  const pan = Gesture.Pan()
    .enabled(mode === 'browse')
    .activeOffsetY(14)
    .failOffsetX([-14, 14])
    .onUpdate((event) => {
      drag.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > dismissDistance || event.velocityY > dismissVelocity) {
        scheduleOnRN(dismiss);
      } else {
        drag.set(withSpring(0, { damping: 20, stiffness: 220 }));
      }
    });

  const originGeometry = origin
    ? {
        scale: origin.width / cardWidth,
        x: origin.x + origin.width / 2 - screenWidth / 2,
        y: origin.y + origin.height / 2 - (cardTop + cardHeight / 2),
      }
    : undefined;
  const useScale = useCardHeight / cardHeight;
  const useOffset = useCardTop + useCardHeight / 2 - (cardTop + cardHeight / 2);
  const groupStyle = useAnimatedStyle(() => {
    const p = presence.get();
    const u = useProgress.get();
    const d = drag.get();
    const fromOrigin = originGeometry && isOriginCurrent.get() === 1 ? originGeometry : undefined;
    const startScale = fromOrigin ? fromOrigin.scale : 0.9;
    const dragScale = 1 - Math.min(d / screenHeight, 0.5) * 0.5;
    return {
      opacity: fromOrigin ? 1 : p,
      transform: [
        { translateX: (fromOrigin?.x ?? 0) * (1 - p) },
        { translateY: (fromOrigin?.y ?? 0) * (1 - p) + useOffset * u + d },
        { scale: (startScale + (1 - startScale) * p) * (1 + (useScale - 1) * u) * dragScale },
      ],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: presence.get() * (1 - Math.min(drag.get() / 400, 0.6)),
  }));
  const browseChromeStyle = useAnimatedStyle(() => {
    const p = presence.get();
    return { opacity: p * p * (1 - useProgress.get()) * (1 - Math.min(drag.get() / 200, 1)) };
  });
  const infoStyle = useAnimatedStyle(() => {
    const position = scrollX.get() / snap;
    const settle = 1 - Math.min(1, Math.abs(position - Math.round(position)) * 2.2);
    const p = presence.get();
    return {
      opacity: p * p * settle * (1 - useProgress.get()) * (1 - Math.min(drag.get() / 200, 1)),
    };
  });
  const useChromeStyle = useAnimatedStyle(() => ({
    opacity: useProgress.get(),
    transform: [{ translateY: (1 - useProgress.get()) * 24 }],
  }));

  if (!current) return null;

  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityViewIsModal
        className="flex-1"
        onAccessibilityEscape={mode === 'use' ? exitUse : dismiss}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
          <View className="absolute inset-0 bg-background" />
          <Image
            blurRadius={60}
            contentFit="cover"
            source={current.preview}
            style={styles.ambient}
            transition={300}
          />
          <View className="absolute inset-0 bg-background/55" />
        </Animated.View>

        <Animated.View
          pointerEvents={mode === 'browse' ? 'auto' : 'none'}
          style={[styles.tabs, { top: tabsTop }, browseChromeStyle]}
        >
          <View className="mx-auto h-1.5 w-9 rounded-full bg-border-strong" />
          <ScrollView
            contentContainerClassName="grow justify-center gap-5 px-6"
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {(['all', ...PAINTING_TEMPLATE_CATEGORIES] as const).map((value) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: value === category }}
                hitSlop={8}
                key={value}
                onPress={() => selectCategory(value)}
                testID={`painting-template-category-${value}`}
              >
                <Text
                  className={
                    value === category
                      ? 'font-semibold text-foreground text-sm'
                      : 'text-muted-foreground text-sm'
                  }
                >
                  {t(categoryLabelKeys[value])}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.group, { height: cardHeight, top: cardTop }, groupStyle]}>
          <Animated.FlatList
            contentContainerStyle={{ paddingHorizontal: (screenWidth - snap) / 2 }}
            data={visibleTemplates}
            decelerationRate="fast"
            disableIntervalMomentum
            getItemLayout={(_data, itemIndex) => ({
              index: itemIndex,
              length: snap,
              offset: snap * itemIndex,
            })}
            horizontal
            initialScrollIndex={listInitialIndex}
            key={category}
            keyExtractor={(template) => template.id}
            onScroll={onScroll}
            renderItem={({ index: itemIndex, item }) => (
              <StageCard
                cardHeight={cardHeight}
                cardWidth={cardWidth}
                drag={drag}
                index={itemIndex}
                originHeight={
                  origin?.templateId === item.id
                    ? (cardWidth * origin.height) / origin.width
                    : undefined
                }
                presence={presence}
                scrollX={scrollX}
                snap={snap}
                template={item}
                useProgress={useProgress}
              />
            )}
            scrollEnabled={mode === 'browse'}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            snapToInterval={snap}
          />
        </Animated.View>

        <Animated.View
          pointerEvents={mode === 'browse' ? 'box-none' : 'none'}
          style={[styles.footer, { top: cardTop + cardHeight + 28 }]}
        >
          <Animated.View className="items-center gap-1 px-8" style={infoStyle}>
            <Text className="text-center font-semibold text-2xl text-foreground" numberOfLines={1}>
              {current.title}
            </Text>
            <Text className="text-center text-muted-foreground text-sm" numberOfLines={2}>
              {current.summary}
            </Text>
          </Animated.View>
          <Animated.View className="px-6" style={browseChromeStyle}>
            <Button onPress={enterUse} shape="pill" size="lg" testID="painting-template-use">
              <Button.Label>{t('painting.templates.use')}</Button.Label>
            </Button>
          </Animated.View>
        </Animated.View>

        {mode === 'use' ? (
          <>
            <Animated.View
              className="flex-row items-center px-4"
              style={[styles.useHeader, { top: insets.top + 8 }, useChromeStyle]}
            >
              <Pressable
                accessibilityLabel={t('common.back')}
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-full border border-border-subtle bg-card active:opacity-70"
                hitSlop={4}
                onPress={exitUse}
                testID="painting-template-use-back"
              >
                <ArrowLeftIcon className="size-5 text-foreground" />
              </Pressable>
              <Text
                className="mx-3 flex-1 text-center font-semibold text-foreground text-lg"
                numberOfLines={1}
              >
                {current.title}
              </Text>
              <View className="size-11" />
            </Animated.View>
            <Animated.View style={[styles.panel, { top: panelTop }, useChromeStyle]}>
              <TemplateUsePanel key={current.id} template={current} />
            </Animated.View>
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function StageCard({
  cardHeight,
  cardWidth,
  drag,
  index,
  originHeight,
  presence,
  scrollX,
  snap,
  template,
  useProgress,
}: {
  cardHeight: number;
  cardWidth: number;
  drag: SharedValue<number>;
  index: number;
  /** The gallery card's height at this card's width, while it grows out of it. */
  originHeight: number | undefined;
  presence: SharedValue<number>;
  scrollX: SharedValue<number>;
  snap: number;
  template: PaintingTemplate;
  useProgress: SharedValue<number>;
}) {
  const slotStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.get() / snap - index);
    const p = presence.get();
    const neighbours = p * p * (1 - useProgress.get()) * (1 - Math.min(drag.get() / 200, 1));
    return {
      opacity:
        interpolate(distance, [0, 1], [1, sideOpacity], Extrapolation.CLAMP) *
        (distance < 0.5 ? 1 : neighbours),
      transform: [{ scale: interpolate(distance, [0, 1], [1, sideScale], Extrapolation.CLAMP) }],
    };
  });
  const cardStyle = useAnimatedStyle(() => ({
    height:
      originHeight === undefined
        ? cardHeight
        : originHeight + (cardHeight - originHeight) * presence.get(),
  }));

  return (
    <Animated.View
      className="items-center justify-center"
      style={[{ height: cardHeight, width: snap }, slotStyle]}
    >
      <Animated.View
        accessibilityLabel={template.title}
        accessibilityRole="image"
        className="overflow-hidden rounded-4xl border border-border-subtle bg-secondary"
        style={[{ width: cardWidth }, cardStyle]}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          source={template.preview}
          style={styles.fill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ambient: { ...StyleSheet.absoluteFill, transform: [{ scale: 1.2 }] },
  fill: { height: '100%', width: '100%' },
  footer: { gap: 24, left: 0, position: 'absolute', right: 0 },
  group: { left: 0, position: 'absolute', right: 0 },
  panel: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  tabs: { gap: 10, left: 0, position: 'absolute', right: 0 },
  useHeader: { left: 0, position: 'absolute', right: 0 },
});
