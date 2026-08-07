import { ArrowUpIcon, PlusIcon, SquareIcon, XIcon } from 'lucide-uniwind/png';
import { useEffect, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import type { ComposerAttachment, ComposerLabels, ComposerProps } from './composer.types';
import { ComposerSurface, composerTextInsets } from './composerPlatform';

const circleSize = 44;
const pillRadius = 24;
const pillPaddingHorizontal = 14;
const pillPaddingVertical = 6;
const thumbnailSize = 120;
const maxTextHeight = 120;

// One duration for the thumbnail strip's swell/shrink so the fade and the
// height collapse stay in lockstep; anything else reads as two animations.
const stripMotion = {
  duration: 220,
  easing: Easing.inOut(Easing.ease),
} as const;

// Stable reference: a `= []` default would be a fresh array every render, which
// re-triggers the "keep the last non-empty snapshot" adjustment below.
const noAttachments: readonly ComposerAttachment[] = [];

const defaultLabels: ComposerLabels = {
  addAttachment: 'Add attachment',
  attachment: 'Attachment',
  removeAttachment: 'Remove attachment',
  send: 'Send message',
  stop: 'Stop generating',
};

// Geometry lives in `style`, not className: GlassView doesn't take className, so
// this is the only way both surface branches stay pixel-identical. That includes
// content alignment — the circles center their icon, the pill must not (its text
// area and thumbnail strip have to fill the width).
const circleStyle = {
  alignItems: 'center',
  height: circleSize,
  justifyContent: 'center',
  width: circleSize,
} as const;
const pillStyle = {
  justifyContent: 'center',
  minHeight: circleSize,
  paddingHorizontal: pillPaddingHorizontal,
  paddingVertical: pillPaddingVertical,
} as const;
const thumbnailStyle = { height: thumbnailSize, width: thumbnailSize };
const textInputStyle = { maxHeight: maxTextHeight, ...composerTextInsets };

/**
 * Chat composer: a leading action, a text field that grows with its content,
 * and a primary action that flips between send and stop.
 *
 * Fully controlled — `value`/`attachments` and their callbacks are the caller's
 * to own, so the same component backs a chat screen, a prompt box, or a story.
 */
export function Composer({
  attachments = noAttachments,
  autoFocus = false,
  labels,
  leading,
  onAttachmentRemove,
  onChangeText,
  onLeadingPress,
  onSend,
  onStop,
  placeholder,
  streaming = false,
  style,
  testID,
  value,
}: ComposerProps) {
  const resolvedLabels = labels ? { ...defaultLabels, ...labels } : defaultLabels;
  const placeholderStyle = useResolveClassNames('text-muted-foreground');
  const primaryStyle = useResolveClassNames('bg-primary');
  const hasAttachments = attachments.length > 0;
  const canSend = value.trim().length > 0 || hasAttachments;

  // The strip lives in a height-clipped container so the pill swells and
  // shrinks as attachments come and go. The inner row reports its natural
  // height; the clip animates between that and zero.
  const [stripContentHeight, setStripContentHeight] = useState(0);
  const stripHeight = useSharedValue(0);
  const stripOpacity = useSharedValue(0);

  useEffect(() => {
    stripHeight.set(withTiming(hasAttachments ? stripContentHeight : 0, stripMotion));
    stripOpacity.set(withTiming(hasAttachments ? 1 : 0, stripMotion));
  }, [hasAttachments, stripContentHeight, stripHeight, stripOpacity]);

  const stripStyle = useAnimatedStyle(() => ({
    height: stripHeight.value,
    opacity: stripOpacity.value,
  }));

  // Rendering `attachments` directly would unmount the thumbnails the instant
  // the list empties, leaving an empty box to collapse. Keep the last non-empty
  // snapshot on screen until a new one replaces it.
  const [visibleAttachments, setVisibleAttachments] = useState(attachments);

  if (hasAttachments && visibleAttachments !== attachments) {
    setVisibleAttachments(attachments);
  }

  const handleStripLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);

    // Sub-pixel layout jitter would otherwise restart the timing animation on
    // every measurement pass.
    setStripContentHeight((current) =>
      Math.abs(current - nextHeight) <= 1 ? current : nextHeight,
    );
  };

  const handlePrimaryPress = () => {
    if (streaming && onStop) {
      onStop();
      return;
    }

    if (canSend) {
      onSend();
    }
  };

  const isStopping = streaming && onStop !== undefined;
  const isPrimaryActive = isStopping || canSend;
  const PrimaryIcon = isStopping ? SquareIcon : ArrowUpIcon;
  const primaryTint =
    isPrimaryActive && typeof primaryStyle.backgroundColor === 'string'
      ? primaryStyle.backgroundColor
      : undefined;

  return (
    <View className="flex-row items-end gap-2" style={style} testID={testID}>
      {/* `undefined` means "give me the default"; `null` deliberately drops the slot. */}
      {leading !== undefined ? (
        leading
      ) : (
        <Pressable
          accessibilityLabel={resolvedLabels.addAttachment}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onLeadingPress}
          testID={testID ? `${testID}-leading` : undefined}
        >
          <ComposerSurface
            className="bg-surface-secondary"
            cornerRadius={circleSize / 2}
            interactive
            style={circleStyle}
          >
            <PlusIcon className="size-6 text-foreground" strokeWidth={2} />
          </ComposerSurface>
        </Pressable>
      )}

      {/* The pill owns the flex; the glass surface inside can only be sized in
          `style`, so the stretch has to happen on this wrapper. */}
      <View className="flex-1">
        <ComposerSurface
          className="bg-field ios:shadow-field android:shadow-sm"
          cornerRadius={pillRadius}
          style={pillStyle}
        >
          <Animated.View
            className="overflow-hidden"
            pointerEvents={hasAttachments ? 'auto' : 'none'}
            style={stripStyle}
          >
            <View className="flex-row flex-wrap gap-2 pt-0.5 pb-2" onLayout={handleStripLayout}>
              {visibleAttachments.map((attachment) => (
                <AttachmentThumbnail
                  attachment={attachment}
                  key={attachment.id}
                  labels={resolvedLabels}
                  onRemove={onAttachmentRemove}
                />
              ))}
            </View>
          </Animated.View>

          <TextInput
            autoFocus={autoFocus}
            className="text-base text-foreground"
            multiline
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={
              typeof placeholderStyle.color === 'string' ? placeholderStyle.color : undefined
            }
            style={textInputStyle}
            testID={testID ? `${testID}-input` : undefined}
            value={value}
          />
        </ComposerSurface>
      </View>

      <Pressable
        accessibilityLabel={isStopping ? resolvedLabels.stop : resolvedLabels.send}
        accessibilityRole="button"
        accessibilityState={{ disabled: !isPrimaryActive }}
        disabled={!isPrimaryActive}
        hitSlop={6}
        onPress={handlePrimaryPress}
        testID={testID ? `${testID}-primary-action` : undefined}
      >
        {/* Tinted glass rather than a second variant: on iOS 26 the active send
            button is the same material as the rest, just carrying the accent. */}
        <ComposerSurface
          className={isPrimaryActive ? 'bg-primary' : 'bg-surface-secondary'}
          cornerRadius={circleSize / 2}
          interactive
          style={circleStyle}
          tintColor={primaryTint}
        >
          <PrimaryIcon
            className={cn(
              isPrimaryActive ? 'text-white' : 'text-muted-foreground',
              isStopping ? 'size-4' : 'size-6',
            )}
            strokeWidth={2}
          />
        </ComposerSurface>
      </Pressable>
    </View>
  );
}

function AttachmentThumbnail({
  attachment,
  labels,
  onRemove,
}: {
  attachment: ComposerAttachment;
  labels: ComposerLabels;
  onRemove?: (id: string) => void;
}) {
  return (
    <View
      accessibilityLabel={attachment.name ?? labels.attachment}
      className="overflow-hidden rounded-2xl bg-surface-secondary"
      style={thumbnailStyle}
    >
      <Image resizeMode="cover" source={{ uri: attachment.uri }} style={thumbnailStyle} />
      {onRemove ? (
        <Pressable
          accessibilityLabel={labels.removeAttachment}
          accessibilityRole="button"
          className="absolute top-1.5 right-1.5 size-6 items-center justify-center rounded-full bg-black/55 active:opacity-70"
          hitSlop={8}
          onPress={() => onRemove(attachment.id)}
        >
          <XIcon className="size-3.5 text-white" strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}
