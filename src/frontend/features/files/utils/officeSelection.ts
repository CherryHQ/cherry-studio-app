import type { FilePreviewSelection } from '@cherrystudio/file-preview-webview/protocol';

import type { ResolvedFile } from '@/shared/contracts/file';
import {
  OfficeSelectionSchema,
  type OfficeSelection,
} from '@/shared/data/types/selectionReference';

/**
 * The composer chip for a preview selection, labelled like desktop's (`file · ¶4`, `file · Sheet!B2`,
 * `file · Slide 2`). The file stays an attachment; the selection carries anchor and excerpt.
 */
export function officeSelectionReference(
  file: ResolvedFile,
  selection: FilePreviewSelection,
  slideLabel: (slide: number) => string,
): { label: string; selection: OfficeSelection } | undefined {
  const { anchor } = selection;
  if (
    selection.sourceId !== file.entry.id ||
    selection.revision !== String(file.entry.updatedAt) ||
    anchor.format === 'pdf'
  )
    return undefined;
  const locator =
    anchor.format === 'docx'
      ? `¶${anchor.paragraph + 1}`
      : anchor.format === 'xlsx'
        ? `${anchor.sheet}!${anchor.range}`
        : slideLabel(anchor.slide);
  const parsed = OfficeSelectionSchema.safeParse({
    file_entry_id: file.entry.id,
    anchor,
    excerpt: selection.excerpt,
  });
  return parsed.success
    ? { label: `${file.entry.filename} · ${locator}`, selection: parsed.data }
    : undefined;
}
