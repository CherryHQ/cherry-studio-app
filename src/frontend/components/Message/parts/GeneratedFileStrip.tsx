import { View } from 'react-native';

import { FileEntryAttachment } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/** Assistant-produced files shown as full-width result cards below the answer. */
export function GeneratedFileStrip({ parts }: { parts: readonly MessageFilePart[] }) {
  return (
    <View className="w-full gap-2">
      {parts.map((part) => {
        const entryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;
        return entryId ? <FileEntryAttachment entryId={entryId} key={part.url} /> : null;
      })}
    </View>
  );
}
