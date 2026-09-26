import { useToast } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { ImageDropTargetView, type ImageDropEvent } from '../../../../../modules/image-drop-target';
import { useComposerActions } from '../context/ComposerProvider';
import {
  cleanupDropStagedFile,
  createDroppedImageAttachmentDraft,
  isDropStagedFile,
  isDroppedImagePayload,
} from '../utils/composerAttachments';

type ComposerDropAreaProps = PropsWithChildren<{
  /** When false (no composer) the container stays but refuses every drop. */
  enabled?: boolean;
}>;

/**
 * Accepts images dragged into the composer's screen from another app and
 * stages them through the same attachment pipeline as the photo picker. The
 * caller mounts it around the whole conversation surface — iMessage-style,
 * the drop works anywhere over the chat, not just over the input field.
 *
 * Non-image payloads never reach staging: the native side rejects sessions
 * without image items, and a media-type filter guards the JS side too. A
 * drop is not capped: like the photo picker, a message holds any number of
 * images. Every file this module staged but the composer did not accept is
 * deleted — imported ones right after the managed copy, rejected or failed
 * ones when the drop is processed. Dropping needs no photo-library
 * permission — the system delivers the data as part of the user's explicit
 * drag.
 *
 * The highlight appears only while the drag hovers the area, per the HIG.
 */
export function ComposerDropArea({ children, enabled = true }: ComposerDropAreaProps) {
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
      const unsupported = event.images.filter((image) => !isDroppedImagePayload(image));
      if (images.length === 0 && unsupported.length === 0 && event.failedCount === 0) {
        return;
      }
      // Unsupported payloads never reach the composer; their staged cache
      // copies are owned by nobody.
      for (const image of unsupported) {
        if (isDropStagedFile(image.uri)) {
          void cleanupDropStagedFile(image.uri);
        }
      }

      if (event.failedCount > 0) {
        toast.show({
          label: t('chat.attachments.dropFailed', { count: event.failedCount }),
          variant: 'warning',
        });
      }
      if (images.length > 0) {
        addAttachments(images.map((image) => createDroppedImageAttachmentDraft(image)));
      }
    },
    [addAttachments, t, toast],
  );

  if (Platform.OS !== 'ios' || !ImageDropTargetView) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <ImageDropTargetView
      enabled={enabled}
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
