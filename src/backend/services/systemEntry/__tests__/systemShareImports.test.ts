import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';
import {
  discardNormalizedImage,
  normalizeImportedImage,
} from '@/backend/services/file/importedImageNormalization';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { NativeSystemEntry } from '../../../../../modules/system-integration';
import { createSystemShareImporter } from '../systemShareImports';

jest.mock('@/backend/services/file/filePreviewStorage', () => ({
  createInternalEntryWithPreview: jest.fn(),
}));
jest.mock('@/backend/services/file/importedImageNormalization', () => ({
  discardNormalizedImage: jest.fn(),
  normalizeImportedImage: jest.fn(),
}));
jest.mock('@/backend/services/file/fileStorage', () => ({
  getInternalFileUri: (entry: { id: string }) => `file:///library/${entry.id}`,
}));

const entry: NativeSystemEntry = {
  version: 1,
  id: '42f7f701-37d6-4731-b7a8-8e7f3040be55',
  createdAt: 1,
  kind: 'share.receive',
  text: '',
  files: [
    { uri: 'file:///staged/photo.png', name: 'photo.png', mediaType: 'image/png', size: 9e6 },
  ],
};

test('imports a shared image the way a picked one is imported', async () => {
  const normalized = { mediaType: 'image/jpeg', name: 'photo.jpg', uri: 'file:///cache/photo.jpg' };
  jest.mocked(normalizeImportedImage).mockResolvedValue(normalized);
  jest.mocked(createInternalEntryWithPreview).mockResolvedValue(
    FileEntrySchema.parse({
      id: 'ac3a0b0e-1f30-4e5c-8a51-6d0f51a5b2c7',
      filename: 'photo.jpg',
      mediaType: 'image/jpeg',
      size: 2e6,
      provenance: 'imported',
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const entries = { create: jest.fn(), delete: jest.fn() };

  const files = await createSystemShareImporter(entries as never)(
    entry,
    new AbortController().signal,
  );

  expect(createInternalEntryWithPreview).toHaveBeenCalledWith(entries, {
    ...normalized,
    provenance: 'imported',
    source: 'uri',
  });
  expect(discardNormalizedImage).toHaveBeenCalledWith(normalized);
  expect(files).toEqual([
    expect.objectContaining({ mediaType: 'image/jpeg', name: 'photo.jpg', size: 2e6 }),
  ]);
});
