import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import { Image, InfoPopover, Spinner } from '@cherrystudio/ui/components';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { PaintingBoardData, PaintingBoardNode } from '../hooks/usePaintingBoard';
import { layoutPaintingBoard } from '../utils/paintingBoardGraph';

const NODE_WIDTH = 112;
const IMAGE_HEIGHT = 140;
const LABEL_HEIGHT = 44;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2;
const HEADER_SPACE = 64;
const HEADER_FADE = 72;
const COMPOSER_SPACE = 120;

/**
 * The whole board as a node canvas: generations top to bottom, edges from each
 * input image to what was made from it. Drag to pan, pinch to zoom, tap a
 * thumbnail to focus its node or a caption to read its full prompt. A board
 * that fits opens whole and centred; a larger one opens with the focused node
 * in its upper third.
 */
export function PaintingBoardOverview({
  board,
  focusedNodeId,
  onSelect,
}: {
  board: PaintingBoardData;
  focusedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const { fontScale, height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const labelHeight = LABEL_HEIGHT * Math.max(1, fontScale);
  const nodeHeight = IMAGE_HEIGHT + labelHeight;
  const layout = useMemo(
    () =>
      layoutPaintingBoard(board.graph, {
        columnGap: 17,
        nodeHeight,
        nodeWidth: NODE_WIDTH,
        rowGap: 44,
      }),
    [board.graph, nodeHeight],
  );
  const edgeColor = useThemeColor('foreground');
  const focused = focusedNodeId ? layout.nodes.get(focusedNodeId) : undefined;
  const contentPadding = 16;
  const top = insets.top + HEADER_SPACE;
  const available = screenHeight - top - insets.bottom - COMPOSER_SPACE;
  const initialX = (screenWidth - layout.width) / 2;
  const initialY =
    layout.height <= available
      ? top + (available - layout.height) / 2
      : Math.min(
          top,
          Math.max(top + available - layout.height, top + available / 3 - (focused?.y ?? 0)),
        );

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  const savedX = useSharedValue(initialX);
  const savedY = useSharedValue(initialY);

  const pan = Gesture.Pan()
    .minDistance(4)
    .onUpdate((event) => {
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });
  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  const reset = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1);
      savedScale.value = 1;
      translateX.value = withTiming(initialX);
      translateY.value = withTiming(initialY);
      savedX.value = initialX;
      savedY.value = initialY;
    });
  const gesture = Gesture.Simultaneous(pan, pinch, reset);
  // Scale around the content's top-left corner so node coordinates stay simple.
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const edges = board.graph.edges.flatMap((edge) => {
    const from = layout.nodes.get(edge.from);
    const to = layout.nodes.get(edge.to);
    const target = board.nodes.get(edge.to);
    if (!from || !to) return [];
    const x1 = from.x + NODE_WIDTH / 2;
    const y1 = from.y + nodeHeight + 4;
    const x2 = to.x + NODE_WIDTH / 2;
    const y2 = to.y - 4;
    const middle = (y1 + y2) / 2;
    return [
      {
        d: `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`,
        isLive: target?.status.kind === 'generating',
        key: `${edge.from}>${edge.to}`,
      },
    ];
  });

  return (
    <GestureDetector gesture={gesture}>
      <View className="flex-1 overflow-hidden">
        <Animated.View
          style={[
            {
              height: layout.height + contentPadding,
              left: 0,
              position: 'absolute',
              top: 0,
              transformOrigin: 'top left',
              width: layout.width,
            },
            contentStyle,
          ]}
        >
          <Svg
            height={layout.height + contentPadding}
            pointerEvents="none"
            style={{ left: 0, position: 'absolute', top: 0 }}
            width={layout.width}
          >
            {edges.map((edge) => (
              <Path
                d={edge.d}
                fill="none"
                key={edge.key}
                stroke={edgeColor}
                strokeDasharray={edge.isLive ? '4 4' : undefined}
                strokeOpacity={edge.isLive ? 0.55 : 0.28}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
          {board.graph.nodes.map((ref) => {
            const node = board.nodes.get(ref.id);
            const position = layout.nodes.get(ref.id);
            if (!node || !position) return null;
            return (
              <BoardNodeCard
                isFocused={ref.id === focusedNodeId}
                key={ref.id}
                labelHeight={labelHeight}
                node={node}
                onPress={() => onSelect(ref.id)}
                x={position.x}
                y={position.y}
              />
            );
          })}
        </Animated.View>
        {/* Fade a themed surface through alpha only, so the header never picks up a dark band. */}
        <MaskedView
          maskElement={
            <LinearGradient
              colors={['black', 'black', 'transparent']}
              locations={[0, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
          }
          pointerEvents="none"
          style={[styles.headerFade, { height: insets.top + HEADER_FADE }]}
        >
          <View className="flex-1 bg-background" />
        </MaskedView>
      </View>
    </GestureDetector>
  );
}

function BoardNodeCard({
  isFocused,
  labelHeight,
  node,
  onPress,
  x,
  y,
}: {
  isFocused: boolean;
  labelHeight: number;
  node: PaintingBoardNode;
  onPress: () => void;
  x: number;
  y: number;
}) {
  const { t } = useTranslation();
  const foreground = useThemeColor('foreground');
  const thumbnail = node.images[0];
  const prompt = node.painting?.brief ?? node.painting?.prompt ?? '';
  const label =
    node.kind === 'import'
      ? t('painting.board.importedImage')
      : node.status.kind === 'generating'
        ? t('painting.status.generating')
        : node.status.kind === 'stopped'
          ? t(
              node.status.reason === 'failed'
                ? 'painting.status.failed'
                : 'painting.status.interrupted',
            )
          : prompt;
  const caption = (
    <View className="flex-row items-center gap-1" style={{ height: labelHeight }}>
      <Text className="min-w-0 flex-1 text-muted-foreground text-xs" numberOfLines={1}>
        {label}
      </Text>
      {prompt ? <InfoIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
    </View>
  );
  return (
    <View className="absolute" style={{ left: x, top: y, width: NODE_WIDTH }}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        className={
          isFocused
            ? 'items-center justify-center overflow-hidden rounded-lg border-2 border-border-selected bg-secondary active:opacity-80'
            : 'items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary active:opacity-80'
        }
        onPress={onPress}
        style={{ height: IMAGE_HEIGHT }}
      >
        {thumbnail ? (
          <Image
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={thumbnail.fileEntryId}
            source={thumbnail.uri}
            style={{ height: '100%', width: '100%' }}
          />
        ) : node.status.kind === 'generating' ? (
          <Spinner color={foreground} />
        ) : node.status.kind === 'stopped' ? (
          <CircleAlertIcon className="size-5 text-destructive" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
        {node.kind === 'import' ? (
          <View className="absolute top-1.5 left-1.5 flex-row items-center gap-1 rounded-full bg-constant-black/55 px-2 py-0.5">
            <ImageIcon className="size-3 text-constant-white" />
            <Text className="text-[11px] text-constant-white">{t('painting.board.imported')}</Text>
          </View>
        ) : null}
        {node.images.length > 1 ? (
          <View className="absolute top-1.5 right-1.5 min-w-5 items-center rounded-full bg-constant-black/55 px-1.5 py-0.5">
            <Text className="font-semibold text-[11px] text-constant-white">
              {node.images.length}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {prompt ? (
        <InfoPopover
          accessibilityLabel={t('painting.board.showPrompt')}
          testID={`painting-prompt-${node.id}`}
          text={prompt}
        >
          {caption}
        </InfoPopover>
      ) : (
        caption
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerFade: { left: 0, position: 'absolute', right: 0, top: 0 },
});
