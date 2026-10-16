import type { FilePreviewSelection } from '@cherrystudio/file-preview-webview/protocol';

import type { ResolvedFile } from '@/shared/contracts/file';
import { createCodeBlockMarkdown } from '@/shared/utils/createCodeBlockMarkdown';

/** Files remain attachments; the reference carries identity, structural coordinates and an excerpt. */
export function officeSelectionDraft(
  file: ResolvedFile,
  selection: FilePreviewSelection,
): string | undefined {
  if (
    selection.sourceId !== file.entry.id ||
    selection.revision !== String(file.entry.updatedAt) ||
    selection.anchor.format === 'pdf'
  )
    return undefined;
  return createCodeBlockMarkdown(
    JSON.stringify({
      file_entry_id: file.entry.id,
      anchor: selection.anchor,
      excerpt: selection.excerpt,
    }),
    'selection-ref',
  );
}
