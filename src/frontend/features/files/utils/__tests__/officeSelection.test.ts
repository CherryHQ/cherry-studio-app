import {
  PageMessageSchema,
  type FilePreviewSelection,
} from '@cherrystudio/file-preview-webview/protocol';

import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { officeSelectionDraft } from '../officeSelection';

const ID = '00000000-0000-7000-8000-000000000001';
const file: ResolvedFile = {
  entry: FileEntrySchema.parse({
    id: ID,
    filename: 'report.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 10,
    provenance: 'imported',
    createdAt: 1,
    updatedAt: 42,
  }),
  uri: 'file:///private/report.docx',
};
const selection: FilePreviewSelection = {
  sourceId: ID,
  revision: '42',
  anchor: { format: 'docx', paragraph: 3, paraId: '1234ABCD', charRange: [1, 5] },
  excerpt: 'quoted ``` content',
};

test('preserves structural coordinates and the excerpt while excluding device paths', () => {
  const draft = officeSelectionDraft(file, selection)!;
  expect(draft).toContain('````selection-ref');
  expect(draft).toContain('"paragraph":3');
  expect(draft).toContain('"charRange":[1,5]');
  expect(draft).toContain('"excerpt":"' + selection.excerpt + '"');
  expect(draft).not.toContain(file.uri);
});

test('rejects a selection captured from another file or revision', () => {
  expect(officeSelectionDraft(file, { ...selection, revision: '41' })).toBeUndefined();
  expect(officeSelectionDraft(file, { ...selection, sourceId: 'another' })).toBeUndefined();
});

test('validates page selections before they can reach the composer', () => {
  expect(PageMessageSchema.safeParse({ type: 'selection', selection }).success).toBe(true);
  expect(
    PageMessageSchema.safeParse({
      type: 'selection',
      selection: { ...selection, excerpt: 'x'.repeat(2001) },
    }).success,
  ).toBe(false);
  expect(
    PageMessageSchema.safeParse({
      type: 'selection',
      selection: { ...selection, anchor: { format: 'docx', paragraph: -1 } },
    }).success,
  ).toBe(false);
});
