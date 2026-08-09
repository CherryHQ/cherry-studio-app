import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import { FilePreview } from '@/frontend/components/FilePreview';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;

  return fileEntryId ? <FilePreview entryId={fileEntryId} /> : null;
}
