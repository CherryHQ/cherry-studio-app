import XIcon from '@cherrystudio/app-icons/icons/x';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';

import {
  type ComposerAttachmentDraft,
  type ComposerAttachmentReady,
} from '../utils/composerAttachments';

type ComposerAttachmentStripProps = {
  attachments: readonly ComposerAttachmentDraft[];
  onAttachmentRemove: (attachmentId: string) => void;
};

/**
 * The row of pending attachments. Sources show import progress until they have
 * a managed file entry; ready files then delegate all presentation and opening
 * behavior to FileEntryPreview.
 */
export function ComposerAttachmentStrip({
  attachments,
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
        attachment.status === 'ready' ? (
          <ManagedAttachmentTile
            attachment={attachment}
            key={attachment.id}
            onRemove={() => onAttachmentRemove(attachment.id)}
          />
        ) : (
          <ImportingAttachmentTile
            attachment={attachment}
            key={attachment.id}
            onRemove={() => onAttachmentRemove(attachment.id)}
          />
        ),
      )}
    </ScrollView>
  );
}

function ManagedAttachmentTile({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachmentReady;
  onRemove: () => void;
}) {
  return (
    <View accessibilityLabel={attachment.name}>
      <FileEntryPreview entryId={attachment.fileEntryId} />
      <RemoveBadge onPress={onRemove} />
    </View>
  );
}

function ImportingAttachmentTile({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachmentDraft;
  onRemove: () => void;
}) {
  return (
    <View accessibilityLabel={attachment.name}>
      <View className="size-28 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-border bg-secondary p-2">
        <ActivityIndicator size="small" />
        <Text className="text-center text-base text-muted-foreground" numberOfLines={2}>
          {attachment.name}
        </Text>
      </View>
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
      <View className="absolute top-1.5 right-1.5 size-7 items-center justify-center rounded-full bg-constant-white">
        <XIcon className="size-4.5 text-constant-black" />
      </View>
    </Pressable>
  );
}
