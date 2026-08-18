import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';

type FilePartProps = {
  part: Extract<CherryMessagePart, { type: 'file' }>;
};

export function FilePart({ part }: FilePartProps) {
  const fileEntryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;

  return fileEntryId ? <FileEntryPreview entryId={fileEntryId} /> : null;
}
