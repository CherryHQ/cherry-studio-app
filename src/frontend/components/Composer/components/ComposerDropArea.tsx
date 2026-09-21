import { useToast } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { ImageDropTargetView, type ImageDropEvent } from '../../../../../modules/image-drop-target';
import { useComposerActions } from '../context/ComposerProvider';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  createDroppedImageAttachmentDraft,
  isDroppedImagePayload,
} from '../utils/composerAttachments';

type ComposerDropAreaProps = PropsWithChildren;

/**
 * Accepts images dragged into the composer's screen from another app and
 * stages them through the same attachment pipeline as the photo picker. The
 * caller mounts it around the whole conversation surface — iMessage-style,
 * the drop works anywhere over the chat, not just over the input field.
 *
 * Non-image payloads never reach staging: the native side rejects sessions
 * without image items, and a media-type filter guards the JS side too.
 * Batches are capped at the photo-picker selection limit, matching what one
 * message can hold. Dropping needs no photo-library permission — the system
 * delivers the data as part of the user's explicit drag.
 *
 * The highlight appears only while the drag hovers the area, per the HIG.
 */
export function ComposerDropArea({ children }: ComposerDropAreaProps) {
  // Android has no system-wide equivalent of inter-app drag sessions; mount a
  // layout-equivalent container so both platforms render the same tree shape.
  // TODO(ios-only): adopt an Android drop surface if one emerges.
  const containerStyle = useResolveClassNames('flex-1');
  const { addAttachments } = useComposerActions();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isHoverActive, setIsHoverActive] = useState(false);

  const handleDragEnter = useCallback(() => setIsHoverActive(true), []);
  const handleDragLeave = useCallback(() => setIsHoverActive(false), []);
  const handleDrop = useCallback(
    (event: ImageDropEvent) => {
      setIsHoverActive(false);
      const images = event.images.filter(isDroppedImagePayload);
      if (images.length === 0) {
        return;
      }
      if (images.length > COMPOSER_PHOTO_SELECTION_LIMIT) {
        toast.show({
          label: t('chat.attachments.dropLimit', { limit: COMPOSER_PHOTO_SELECTION_LIMIT }),
          variant: 'warning',
        });
      }
      addAttachments(
        images
          .slice(0, COMPOSER_PHOTO_SELECTION_LIMIT)
          .map((image) => createDroppedImageAttachmentDraft(image)),
      );
    },
    [addAttachments, t, toast],
  );

  if (Platform.OS !== 'ios' || !ImageDropTargetView) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <ImageDropTargetView
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDropImages={handleDrop}
      style={containerStyle}
    >
      {children}
      {isHoverActive ? (
        <View
          className="absolute inset-0 z-10 border-2 border-selected bg-primary/10"
          pointerEvents="none"
          testID="composer-drop-area-highlight"
        />
      ) : null}
    </ImageDropTargetView>
  );
}
