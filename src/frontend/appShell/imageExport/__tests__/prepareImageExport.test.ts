import type { ExportSignature } from '@/shared/contracts/documentExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { prepareFileExport, prepareImageExport } from '../prepareImageExport';

const signature: ExportSignature = {
  background: '#ffffff',
  foreground: '#000000',
  brandName: 'Cherry Studio',
  timestamp: '2026.09.16 18:00',
  logoDataUrl: 'data:image/png;base64,AA==',
};

test('a captured document keeps its exact PNG bytes on subsequent photo saves and file delivery', async () => {
  const uri = 'file:///managed/conversation.png';
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'conversation.png',
    mediaType: 'image/png',
    provenance: 'document-export',
    createdAt: 1,
    updatedAt: 1,
    size: 1000,
  });
  const photo = await prepareImageExport({ uri, provenance: entry.provenance }, signature);
  const shared = await prepareFileExport({ entry, uri }, signature);
  expect(photo.uri).toBe(uri);
  expect(shared).toMatchObject({ uri, filename: entry.filename, mediaType: entry.mediaType });
  // Neither operation owns the managed source, so releasing its export cannot remove it.
  photo.release();
  shared.release();
});

test('non-image delivery preserves the original format and filename', async () => {
  const uri = 'file:///managed/report.pdf';
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'report.pdf',
    mediaType: 'application/pdf',
    provenance: 'generated',
    createdAt: 1,
    updatedAt: 1,
    size: 1000,
  });
  expect(await prepareFileExport({ entry, uri }, signature)).toMatchObject({
    uri,
    filename: entry.filename,
    mediaType: entry.mediaType,
  });
});
