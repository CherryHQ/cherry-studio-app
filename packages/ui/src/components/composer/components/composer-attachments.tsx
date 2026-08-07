import { XIcon } from 'lucide-uniwind/png';
import { useEffect, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useComposerActions, useComposerState } from '../composer.context';
import { stripRowStyle, thumbnailStyle } from '../composer.layout';
import type {
  ComposerAttachment,
  ComposerAttachmentsProps,
  ComposerLabels,
} from '../composer.types';

// One duration for the thumbnail strip's swell/shrink so the fade and the
// height collapse stay in lockstep; anything else reads as two animations.
const stripMotion = {
  duration: 220,
  easing: Easing.inOut(Easing.ease),
} as const;

/**
 * The thumbnail strip. It is height-clipped and animates between zero and its
 * measured content height, so adding or removing a thumbnail swells and shrinks
 * the composer instead of snapping it.
 */
export function ComposerAttachments({ testID }: ComposerAttachmentsProps) {
  const { attachments, labels } = useComposerState('Composer.Attachments');
  const { removeAttachment } = useComposerActions('Composer.Attachments');
  const hasAttachments = attachments.length > 0;

  // The strip lives in a height-clipped container so the composer swells and
  // shrinks as attachments come and go. The inner row reports its natural
  // height; the clip animates between that and zero.
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    height.set(withTiming(hasAttachments ? contentHeight : 0, stripMotion));
    opacity.set(withTiming(hasAttachments ? 1 : 0, stripMotion));
  }, [contentHeight, hasAttachments, height, opacity]);

  const clipStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  // Rendering `attachments` directly would unmount the thumbnails the instant
  // the list empties, leaving an empty box to collapse. Keep the last non-empty
  // snapshot on screen until a new one replaces it.
  const [visible, setVisible] = useState(attachments);

  if (hasAttachments && visible !== attachments) {
    setVisible(attachments);
  }

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);

    // Sub-pixel layout jitter would otherwise restart the timing animation on
    // every measurement pass.
    setContentHeight((current) => (Math.abs(current - nextHeight) <= 1 ? current : nextHeight));
  };

  return (
    <Animated.View
      className="overflow-hidden"
      pointerEvents={hasAttachments ? 'auto' : 'none'}
      style={clipStyle}
      testID={testID}
    >
      <View
        className="flex-row flex-wrap gap-2 pt-0.5 pb-2"
        onLayout={handleLayout}
        style={stripRowStyle}
      >
        {visible.map((attachment) => (
          <AttachmentThumbnail
            attachment={attachment}
            key={attachment.id}
            labels={labels}
            onRemove={removeAttachment}
          />
        ))}
      </View>
    </Animated.View>
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

ComposerAttachments.displayName = 'Composer.Attachments';
