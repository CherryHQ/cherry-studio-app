import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;

  return fileEntryId ? <FileEntryPreview entryId={fileEntryId} /> : null;
}
