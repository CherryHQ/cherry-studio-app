import { ArrowUpIcon, PlusIcon, SquareIcon, XIcon } from 'lucide-uniwind/png';
import { type ReactNode, useEffect, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import { Surface } from '../surface';
import type { ComposerAttachment, ComposerLabels, ComposerProps } from './composer.types';
import { composerTextStyle } from './composerTextStyle';

const actionIconSize = 24;
/** The toolbar buttons: a circle sized to its icon rather than to its reach. */
export const composerActionSize = actionIconSize + 8;
const surfaceRadius = 24;
// The toolbar's buttons carry their own surface, so the padding is measured to
// their edge rather than to their icons' ink.
const surfacePaddingHorizontal = 12;
const surfacePaddingTop = 8;
const surfacePaddingBottom = 8;
const toolbarGap = 12;
const thumbnailSize = 120;
const maxTextHeight = 120;
// Symmetric on purpose: asymmetric padding would only trade the glyphs'
// centering for the caret's. See `composerTextStyle.ios`.
const textPaddingVertical = 4;
// Lines the text's ink up with the icons' — their boxes are not the same thing,
// since lucide draws its 24pt icons with ~4pt of margin inside the box. Aligning
// the boxes instead leaves the toolbar looking indented from the text above it.
const iconInkMargin = 4;
const textPaddingHorizontal = (composerActionSize - actionIconSize) / 2 + iconInkMargin;
// The circle is well under the 44pt minimum on its own, so the rest of the
// target comes from slop rather than from a bigger shape.
const actionHitSlop = (44 - composerActionSize) / 2;

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
// this is the only way both surface branches stay pixel-identical.
const surfaceStyle = {
  paddingBottom: surfacePaddingBottom,
  paddingHorizontal: surfacePaddingHorizontal,
  paddingTop: surfacePaddingTop,
} as const;
const actionStyle = {
  alignItems: 'center',
  height: composerActionSize,
  justifyContent: 'center',
  width: composerActionSize,
} as const;
const stripRowStyle = { paddingHorizontal: textPaddingHorizontal };
const thumbnailStyle = { height: thumbnailSize, width: thumbnailSize };
const textInputStyle = {
  maxHeight: maxTextHeight,
  paddingHorizontal: textPaddingHorizontal,
  paddingVertical: textPaddingVertical,
  ...composerTextStyle,
};
const toolbarStyle = { marginTop: toolbarGap };

/**
 * Chat composer: one surface holding a text field that grows with its content
 * and, under it, a toolbar row with the tools on the left and a primary action
 * on the right that flips between send and stop.
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
  // Glass inside glass renders nothing — the material has nothing behind it to
  // refract, so an untinted button on the field's own surface is invisible
  // (measured: not one pixel of change across the circle's edge). Tinting it
  // gives the material a colour of its own to carry.
  const actionSurface = useResolveClassNames('bg-surface-secondary');
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
  const actionTint =
    typeof actionSurface.backgroundColor === 'string' ? actionSurface.backgroundColor : undefined;
  const primaryTint =
    isPrimaryActive && typeof primaryStyle.backgroundColor === 'string'
      ? primaryStyle.backgroundColor
      : actionTint;

  return (
    <View style={style} testID={testID}>
      <Surface
        className="bg-field ios:shadow-field android:shadow-sm"
        cornerRadius={surfaceRadius}
        style={surfaceStyle}
      >
        <Animated.View
          className="overflow-hidden"
          pointerEvents={hasAttachments ? 'auto' : 'none'}
          style={stripStyle}
        >
          <View
            className="flex-row flex-wrap gap-2 pt-0.5 pb-2"
            onLayout={handleStripLayout}
            style={stripRowStyle}
          >
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

        {/* Tools pack to the left and the primary action stays pinned right, so
            adding a tool never moves the send button. */}
        <View className="flex-row items-center" style={toolbarStyle}>
          <View className="flex-1 flex-row items-center">
            {/* `undefined` means "give me the default"; `null` deliberately drops the slot. */}
            {leading !== undefined ? (
              leading
            ) : (
              <ComposerAction
                accessibilityLabel={resolvedLabels.addAttachment}
                onPress={onLeadingPress}
                testID={testID ? `${testID}-leading` : undefined}
                tintColor={actionTint}
              >
                <PlusIcon className="size-6 text-foreground" strokeWidth={2} />
              </ComposerAction>
            )}
          </View>

          {/* Tinted glass rather than a second variant: on iOS 26 the active
              send button is the same material as the rest, just carrying the
              accent. */}
          <ComposerAction
            accessibilityLabel={isStopping ? resolvedLabels.stop : resolvedLabels.send}
            className={isPrimaryActive ? 'bg-primary' : 'bg-surface-secondary'}
            disabled={!isPrimaryActive}
            onPress={handlePrimaryPress}
            testID={testID ? `${testID}-primary-action` : undefined}
            tintColor={primaryTint}
          >
            <PrimaryIcon
              className={cn(
                isPrimaryActive ? 'text-white' : 'text-muted-foreground',
                isStopping ? 'size-4' : 'size-6',
              )}
              strokeWidth={2}
            />
          </ComposerAction>
        </View>
      </Surface>
    </View>
  );
}

/** A toolbar button: a circular surface carrying one icon. */
function ComposerAction({
  accessibilityLabel,
  children,
  className = 'bg-surface-secondary',
  disabled = false,
  onPress,
  testID,
  tintColor,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  tintColor?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={actionHitSlop}
      onPress={onPress}
      testID={testID}
    >
      <Surface
        className={className}
        cornerRadius={composerActionSize / 2}
        interactive
        style={actionStyle}
        tintColor={tintColor}
      >
        {children}
      </Surface>
    </Pressable>
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
