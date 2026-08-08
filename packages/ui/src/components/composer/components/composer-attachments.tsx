import { XIcon } from 'lucide-uniwind/png';
import { Image, Pressable, View } from 'react-native';

import { useComposerActions, useComposerState } from '../composer.context';
import { thumbnailStyle } from '../composer.layout';
import type {
  ComposerAttachment,
  ComposerAttachmentsProps,
  ComposerLabels,
} from '../composer.types';
import { ComposerCollapsible } from './composer-collapsible';

/**
 * The thumbnail strip. `Composer.Collapsible` owns the swell and shrink, so this
 * only has to stop rendering the row when the list empties — the thumbnails stay
 * on screen until the collapse lands.
 */
export function ComposerAttachments({ testID }: ComposerAttachmentsProps) {
  const { attachments, labels } = useComposerState('Composer.Attachments');
  const { removeAttachment } = useComposerActions('Composer.Attachments');

  return (
    <ComposerCollapsible testID={testID}>
      {attachments.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 pt-0.5 pb-2">
          {attachments.map((attachment) => (
            <AttachmentThumbnail
              attachment={attachment}
              key={attachment.id}
              labels={labels}
              onRemove={removeAttachment}
            />
          ))}
        </View>
      ) : null}
    </ComposerCollapsible>
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
