import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
  size?: number;
};

export function FilePart({ part, size }: FilePartProps) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;

  return fileEntryId ? <FileEntryPreview entryId={fileEntryId} size={size} /> : null;
}
