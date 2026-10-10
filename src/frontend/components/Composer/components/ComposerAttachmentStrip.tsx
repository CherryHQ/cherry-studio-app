import XIcon from '@cherrystudio/app-icons/icons/x';
import { FilePreview, Spinner, type FilePreviewTransfer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Pressable, ScrollView, Text, View } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';

import {
  type ComposerAttachmentDraft,
  type ComposerAttachmentReady,
} from '../utils/composerAttachments';

type ComposerAttachmentStripProps = {
  transfer?: (file: ComposerAttachmentDraft) => FilePreviewTransfer | undefined;
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
  transfer,
  onAttachmentRemove,
}: ComposerAttachmentStripProps) {
  return (
    <ScrollView
      alwaysBounceHorizontal={false}
      contentContainerClassName="gap-2 pr-1"
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      {attachments.map((attachment) =>
        attachment.status === 'ready' ? (
          <ManagedAttachmentTile
            attachment={attachment}
            transfer={transfer?.(attachment)}
            key={attachment.id}
            onRemove={() => onAttachmentRemove(attachment.id)}
          />
        ) : (
          <ImportingAttachmentTile
            transfer={transfer?.(attachment)}
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
  transfer,
  onRemove,
}: {
  transfer?: FilePreviewTransfer;
  attachment: ComposerAttachmentReady;
  onRemove: () => void;
}) {
  return (
    <View accessibilityLabel={attachment.name}>
      <FileEntryPreview entryId={attachment.fileEntryId} variant="attachment" transfer={transfer} />
      <RemoveBadge onPress={onRemove} />
    </View>
  );
}

function ImportingAttachmentTile({
  attachment,
  transfer,
  onRemove,
}: {
  attachment: ComposerAttachmentDraft;
  transfer?: FilePreviewTransfer;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  if (transfer)
    return (
      <View>
        <FilePreview
          file={null}
          metadata={{
            displayName: attachment.name,
            kind: attachment.kind,
            extensionLabel: attachment.name.includes('.')
              ? (attachment.name.split('.').at(-1)?.toUpperCase() ?? '')
              : '',
          }}
          variant="attachment"
          transfer={transfer}
          labels={{
            openWith: t('filePreview.openWith'),
            unavailable: t('filePreview.unavailable'),
          }}
          onPress={() => {}}
          onError={() => {}}
        />
        <RemoveBadge onPress={onRemove} />
      </View>
    );
  return (
    <View>
      <View
        accessibilityLabel={attachment.name}
        accessibilityState={{ busy: true }}
        accessible
        className="size-28 items-start justify-between gap-1 overflow-hidden rounded-2xl bg-secondary p-3"
      >
        <Spinner
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          size="sm"
        />
        <Text className="w-full shrink text-sm text-muted-foreground" numberOfLines={3}>
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
