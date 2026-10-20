import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import { Image, ImageGenerationLoader, InfoPopover } from '@cherrystudio/ui/components';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { PaintingBoardData, PaintingBoardNode } from '../hooks/usePaintingBoard';
import { layoutPaintingBoard } from '../utils/paintingBoardGraph';

const IMAGE_WIDTH = 120;
const IMAGE_HEIGHT = 160;
const LABEL_HEIGHT = 22;
const CAPTION_GAP = 8;
const COLUMN_GAP = 36;
const ROW_GAP = 48;
const MIN_SCALE = 0.35;
const FIT_SCALE = 0.6;
const MAX_SCALE = 2;
const HEADER_SPACE = 64;
const HEADER_FADE = 72;
const COMPOSER_SPACE = 120;
const HANDLE_SIZE = 9;

/**
 * The board as a canvas: generations read left to right, edges run from each
 * input image to what was made from it, and each node is labelled with its
 * place and model. Tapping a node selects it as the image the composer edits;
 * tapping the selected node opens it full screen; tapping the empty canvas
 * clears the selection so the composer starts a new branch. Drag to pan,
 * pinch to zoom, double tap to return to the opening view.
 */
export function PaintingBoardOverview({
  active,
  board,
  modelName,
  onClearSelection,
  onOpen,
  onSelect,
  selectedNodeId,
}: {
  active: boolean;
  board: PaintingBoardData;
  modelName: (node: PaintingBoardNode) => string | undefined;
  onClearSelection: () => void;
  onOpen: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  selectedNodeId: string | null;
}) {
  const { fontScale, height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const labelHeight = LABEL_HEIGHT * Math.max(1, fontScale);
  const nodeHeight = labelHeight * 2 + IMAGE_HEIGHT + CAPTION_GAP;
  const layout = useMemo(
    () =>
      layoutPaintingBoard(board.graph, {
        columnGap: COLUMN_GAP,
        nodeHeight,
        nodeWidth: IMAGE_WIDTH,
        rowGap: ROW_GAP,
      }),
    [board.graph, nodeHeight],
  );
  const generationNumbers = useMemo(
    () => new Map(board.paintings.map((painting, index) => [painting.id, index + 1])),
    [board.paintings],
  );
  const edgeColor = useThemeColor('foreground');
  const selected = selectedNodeId ? layout.nodes.get(selectedNodeId) : undefined;
  const top = insets.top + HEADER_SPACE;
  const available = screenHeight - top - insets.bottom - COMPOSER_SPACE;
  // A board opens whole when it fits at no less than FIT_SCALE; a larger one brings the
  // selected node into view.
  const fitWidth = screenWidth - 32;
  const initialScale = Math.max(
    FIT_SCALE,
    Math.min(1, fitWidth / layout.width, available / layout.height),
  );
  const scaledWidth = layout.width * initialScale;
  const scaledHeight = layout.height * initialScale;
  const initialX =
    scaledWidth <= fitWidth
      ? (screenWidth - scaledWidth) / 2
      : Math.min(
          16,
          Math.max(
            screenWidth - 16 - scaledWidth,
            screenWidth / 3 - (selected?.x ?? 0) * initialScale,
          ),
        );
  const initialY =
    scaledHeight <= available
      ? top + (available - scaledHeight) / 2
      : Math.min(
          top,
          Math.max(
            top + available - scaledHeight,
            top + available / 3 - (selected?.y ?? 0) * initialScale,
          ),
        );

  const scale = useSharedValue(initialScale);
  const savedScale = useSharedValue(initialScale);
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
      scale.value = withTiming(initialScale);
      savedScale.value = initialScale;
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
    if (!from || !to) return [];
    const x1 = from.x + IMAGE_WIDTH + 4;
    const y1 = from.y + labelHeight + IMAGE_HEIGHT / 2;
    const x2 = to.x - 4;
    const y2 = to.y + labelHeight + IMAGE_HEIGHT / 2;
    const middle = (x1 + x2) / 2;
    return [
      {
        d: `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}`,
        isLive: board.nodes.get(edge.to)?.status.kind === 'generating',
        key: `${edge.from}>${edge.to}`,
      },
    ];
  });
  // Room under the last row for the selected node's size tag.
  const canvasHeight = layout.height + 40;

  return (
    <GestureDetector gesture={gesture}>
      <View className="flex-1 overflow-hidden">
        <Pressable
          accessible={false}
          onPress={onClearSelection}
          style={StyleSheet.absoluteFill}
          testID="painting-board-canvas"
        />
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              height: canvasHeight,
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
            height={canvasHeight}
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
                strokeWidth={1.25}
              />
            ))}
          </Svg>
          {board.graph.nodes.map((ref) => {
            const node = board.nodes.get(ref.id);
            const position = layout.nodes.get(ref.id);
            if (!node || !position) return null;
            const number = node.painting ? generationNumbers.get(node.painting.id) : undefined;
            return (
              <BoardNodeCard
                active={active}
                isSelected={ref.id === selectedNodeId}
                key={ref.id}
                labelHeight={labelHeight}
                modelName={modelName(node)}
                node={node}
                number={number}
                onPress={() => (ref.id === selectedNodeId ? onOpen(ref.id) : onSelect(ref.id))}
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
  active,
  isSelected,
  labelHeight,
  modelName,
  node,
  number,
  onPress,
  x,
  y,
}: {
  active: boolean;
  isSelected: boolean;
  labelHeight: number;
  modelName: string | undefined;
  node: PaintingBoardNode;
  number: number | undefined;
  onPress: () => void;
  x: number;
  y: number;
}) {
  const { t } = useTranslation();
  const [pixelSize, setPixelSize] = useState<{ height: number; width: number }>();
  const thumbnail = node.images[0];
  const prompt = node.painting?.brief ?? node.painting?.prompt ?? '';
  const detail =
    node.kind === 'import'
      ? t('painting.board.imported')
      : node.status.kind === 'generating'
        ? t('painting.status.generating')
        : node.status.kind === 'stopped'
          ? t(
              node.status.reason === 'failed'
                ? 'painting.status.failed'
                : 'painting.status.interrupted',
            )
          : modelName;
  const label = (
    <View
      className="flex-row items-center gap-1.5"
      style={{ height: labelHeight, width: IMAGE_WIDTH }}
    >
      {number !== undefined ? (
        <Text className="font-mono text-[11px] text-foreground">
          {String(number).padStart(2, '0')}
        </Text>
      ) : null}
      {detail ? (
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="absolute" style={{ left: x, top: y, width: IMAGE_WIDTH }}>
      {prompt ? (
        <InfoPopover
          accessibilityLabel={t('painting.board.showPrompt')}
          testID={`painting-prompt-${node.id}`}
          text={prompt}
        >
          {label}
        </InfoPopover>
      ) : (
        label
      )}
      <Pressable
        accessibilityHint={isSelected ? t('painting.board.openHint') : undefined}
        accessibilityLabel={prompt || t('painting.board.importedImage')}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        className="items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-secondary active:opacity-80"
        onPress={onPress}
        style={{ height: IMAGE_HEIGHT, width: IMAGE_WIDTH }}
        testID={`painting-board-node-${node.id}`}
      >
        {thumbnail ? (
          <Image
            cachePolicy="memory-disk"
            contentFit="cover"
            onLoad={({ source }) => setPixelSize({ height: source.height, width: source.width })}
            recyclingKey={thumbnail.fileEntryId}
            source={thumbnail.uri}
            style={{ height: '100%', width: '100%' }}
          />
        ) : node.status.kind === 'generating' ? (
          <ImageGenerationLoader
            accessible={false}
            active={active}
            height={IMAGE_HEIGHT}
            width={IMAGE_WIDTH}
          />
        ) : node.status.kind === 'stopped' ? (
          <CircleAlertIcon className="size-5 text-destructive" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
        {node.images.length > 1 ? (
          <View className="absolute top-1.5 right-1.5 min-w-5 items-center rounded-full bg-constant-black/55 px-1.5 py-0.5">
            <Text className="font-semibold text-[11px] text-constant-white">
              {node.images.length}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {prompt ? (
        <View style={{ paddingTop: CAPTION_GAP }}>
          <InfoPopover
            accessibilityLabel={t('painting.board.showPrompt')}
            testID={`painting-prompt-preview-${node.id}`}
            text={prompt}
          >
            <View
              className="flex-row items-center gap-1"
              style={{ height: labelHeight, width: IMAGE_WIDTH }}
            >
              <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                {prompt}
              </Text>
              <InfoIcon className="size-3 shrink-0 text-muted-foreground" />
            </View>
          </InfoPopover>
        </View>
      ) : null}
      {isSelected ? (
        <SelectionFrame
          footerHeight={prompt ? labelHeight + CAPTION_GAP : 0}
          pixelSize={thumbnail ? pixelSize : undefined}
          top={labelHeight}
        />
      ) : null}
    </View>
  );
}

/** Marks the node the composer will edit: an outline, corner handles, and its pixel size. */
function SelectionFrame({
  footerHeight,
  pixelSize,
  top,
}: {
  footerHeight: number;
  pixelSize: { height: number; width: number } | undefined;
  top: number;
}) {
  const corners = [
    { left: -HANDLE_SIZE / 2 - 3, top: -HANDLE_SIZE / 2 - 3 },
    { left: IMAGE_WIDTH - HANDLE_SIZE / 2 + 3, top: -HANDLE_SIZE / 2 - 3 },
    { left: -HANDLE_SIZE / 2 - 3, top: IMAGE_HEIGHT - HANDLE_SIZE / 2 + 3 },
    { left: IMAGE_WIDTH - HANDLE_SIZE / 2 + 3, top: IMAGE_HEIGHT - HANDLE_SIZE / 2 + 3 },
  ];
  return (
    <View pointerEvents="none" style={[styles.selection, { top }]}>
      <View
        className="absolute rounded-lg border-[1.5px] border-foreground"
        style={styles.outline}
      />
      {corners.map((corner) => (
        <View
          className="absolute rounded-xs border-[1.5px] border-foreground bg-background"
          key={`${corner.left}:${corner.top}`}
          style={[corner, styles.handle]}
        />
      ))}
      {pixelSize ? (
        <View
          className="absolute items-center"
          style={[styles.sizeTag, { top: IMAGE_HEIGHT + footerHeight + 10 }]}
        >
          <View className="rounded-sm bg-foreground px-1.5 py-0.5">
            <Text className="font-mono text-[11px] text-background">
              {pixelSize.width} × {pixelSize.height}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { height: HANDLE_SIZE, width: HANDLE_SIZE },
  headerFade: { left: 0, position: 'absolute', right: 0, top: 0 },
  outline: { bottom: -3, left: -3, right: -3, top: -3 },
  selection: { height: IMAGE_HEIGHT, left: 0, position: 'absolute', width: IMAGE_WIDTH },
  sizeTag: { left: -40, right: -40 },
});
