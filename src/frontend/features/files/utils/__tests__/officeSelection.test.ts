import {
  PageMessageSchema,
  type FilePreviewSelection,
} from '@cherrystudio/file-preview-webview/protocol';

import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { officeSelectionReference } from '../officeSelection';

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

const slide = (number: number) => `Slide ${number}`;

test('labels the chip like desktop and keeps coordinates and the excerpt without device paths', () => {
  expect(officeSelectionReference(file, selection, slide)).toEqual({
    label: 'report.docx · ¶4',
    selection: { file_entry_id: ID, anchor: selection.anchor, excerpt: selection.excerpt },
  });
  expect(JSON.stringify(officeSelectionReference(file, selection, slide))).not.toContain(file.uri);
  expect(
    officeSelectionReference(
      file,
      { ...selection, anchor: { format: 'xlsx', sheet: '假设', range: 'B4' } },
      slide,
    )?.label,
  ).toBe('report.docx · 假设!B4');
  expect(
    officeSelectionReference(file, { ...selection, anchor: { format: 'pptx', slide: 2 } }, slide)
      ?.label,
  ).toBe('report.docx · Slide 2');
});

test('rejects a selection captured from another file, revision or a PDF', () => {
  expect(officeSelectionReference(file, { ...selection, revision: '41' }, slide)).toBeUndefined();
  expect(
    officeSelectionReference(file, { ...selection, sourceId: 'another' }, slide),
  ).toBeUndefined();
  expect(
    officeSelectionReference(file, { ...selection, anchor: { format: 'pdf', page: 1 } }, slide),
  ).toBeUndefined();
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
