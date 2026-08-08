import { XIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Pressable, ScrollView, View } from 'react-native';

import { FileTile, ImageTile } from '@/frontend/components/mediaTile';

import type { ComposerAttachmentDraft } from '../utils/composerAttachments';

type ComposerAttachmentStripProps = {
  attachments: readonly ComposerAttachmentDraft[];
  onAttachmentPreview: (attachment: ComposerAttachmentDraft) => void;
  onAttachmentRemove: (attachmentId: string) => void;
};

/**
 * The row of pending attachments. Two tile shapes, scrolling sideways, tapping
 * an image to preview it — which is why `Composer` ships no strip of its own and
 * this is written here, inside a `Composer.Collapsible` that owns the swell and
 * shrink.
 */
export function ComposerAttachmentStrip({
  attachments,
  onAttachmentPreview,
  onAttachmentRemove,
}: ComposerAttachmentStripProps) {
  return (
    <ScrollView
      alwaysBounceHorizontal={false}
      contentContainerClassName="gap-3 pr-1"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {attachments.map((attachment) =>
        attachment.kind === 'image' ? (
          <AttachmentImageTile
            attachment={attachment}
            key={attachment.id}
            onPreview={() => onAttachmentPreview(attachment)}
            onRemove={() => onAttachmentRemove(attachment.id)}
          />
        ) : (
          <AttachmentFileTile
            attachment={attachment}
            key={attachment.id}
            onRemove={() => onAttachmentRemove(attachment.id)}
          />
        ),
      )}
    </ScrollView>
  );
}

function AttachmentImageTile({
  attachment,
  onPreview,
  onRemove,
}: {
  attachment: ComposerAttachmentDraft;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const accessibilityLabel = attachment.name || t('chat.attachments.image');

  return (
    <View accessibilityLabel={accessibilityLabel}>
      <ImageTile accessibilityLabel={accessibilityLabel} onPress={onPreview} uri={attachment.uri} />
      <RemoveBadge onPress={onRemove} />
    </View>
  );
}

function AttachmentFileTile({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachmentDraft;
  onRemove: () => void;
}) {
  return (
    <View accessibilityLabel={attachment.name}>
      <FileTile name={attachment.name} />
      <RemoveBadge onPress={onRemove} />
    </View>
  );
}

function RemoveBadge({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  // The badge is 28pt but the target is 44: the visible circle sits in the
  // tile's corner, and the slop that makes it tappable would otherwise cover
  // the image underneath it.
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPress();
  };

  return (
    <Pressable
      accessibilityLabel={t('common.remove')}
      accessibilityRole="button"
      className="absolute top-0 right-0 z-[1] size-11 active:opacity-70"
      onPress={handlePress}
    >
      <View className="absolute top-1.5 right-1.5 size-7 items-center justify-center rounded-full bg-white">
        <XIcon className="size-4.5 text-black" strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}
