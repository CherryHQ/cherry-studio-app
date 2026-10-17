import { FileEntrySchema } from '@/shared/data/types/file';

import { editFileImage } from '../editFileImage';
import { generateFilePreviewUri } from '../filePreviewStorage';
import { createInternalEntry, discardInternalEntries, resolveFileEntry } from '../fileStorage';
import { renderEditedImage } from '../renderEditedImage';

jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('../renderEditedImage', () => ({ renderEditedImage: jest.fn() }));
jest.mock('../filePreviewStorage', () => ({ generateFilePreviewUri: jest.fn() }));
jest.mock('../fileStorage', () => ({
  createInternalEntry: jest.fn(),
  discardInternalEntries: jest.fn(),
  resolveFileEntry: jest.fn(),
}));

const source = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    filename: 'photo.png',
    mediaType: 'image/png',
    provenance: 'imported',
    size: 100,
    createdAt: 1,
    updatedAt: 1,
  }),
  uri: 'file:///managed/photo.png',
};
const replacement = {
  entry: FileEntrySchema.parse({
    ...source.entry,
    id: '00000000-0000-4000-8000-000000000002',
    filename: 'photo.png',
  }),
  uri: 'file:///managed/photo-v2.png',
};
const edit = {
  fileEntryId: source.entry.id,
  rotation: 90 as const,
  crop: { x: 0.25, y: 0.1, width: 0.75, height: 0.8 },
};
const temporary = { uri: 'file:///cache/edit.png', release: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(resolveFileEntry).mockResolvedValueOnce(source).mockResolvedValue(replacement);
  jest.mocked(createInternalEntry).mockResolvedValue(replacement.entry);
  jest.mocked(renderEditedImage).mockResolvedValue(temporary);
});

test('stores the rendered derivative while preserving source format, provenance and ownership', async () => {
  await expect(editFileImage(edit)).resolves.toEqual(replacement);
  expect(renderEditedImage).toHaveBeenCalledWith(
    source.uri,
    'image/png',
    expect.objectContaining(edit),
    undefined,
  );
  expect(createInternalEntry).toHaveBeenCalledWith(
    {},
    {
      source: 'uri',
      uri: temporary.uri,
      name: 'photo.png',
      baseFileEntryId: source.entry.id,
      mediaType: 'image/png',
      provenance: 'imported',
    },
    undefined,
  );
  expect(discardInternalEntries).not.toHaveBeenCalled();
  expect(temporary.release).toHaveBeenCalledTimes(1);
});

test('aborting after rendering releases cache bytes before any managed file is written', async () => {
  const controller = new AbortController();
  jest.mocked(renderEditedImage).mockImplementation(async () => {
    controller.abort();
    return temporary;
  });
  await expect(editFileImage(edit, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(createInternalEntry).not.toHaveBeenCalled();
  expect(temporary.release).toHaveBeenCalledTimes(1);
});

test('aborting after storage removes only the derivative and skips thumbnail work', async () => {
  const controller = new AbortController();
  jest.mocked(createInternalEntry).mockImplementation(async () => {
    controller.abort();
    return replacement.entry;
  });
  await expect(editFileImage(edit, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(generateFilePreviewUri).not.toHaveBeenCalled();
  expect(discardInternalEntries).toHaveBeenCalledWith({}, [replacement.entry]);
  expect(temporary.release).toHaveBeenCalledTimes(1);
});

test('a preview failure after storage cannot leave an orphaned edit', async () => {
  jest.mocked(generateFilePreviewUri).mockRejectedValue(new Error('preview storage failed'));
  await expect(editFileImage(edit)).rejects.toThrow('preview storage failed');
  expect(discardInternalEntries).toHaveBeenCalledWith({}, [replacement.entry]);
  expect(temporary.release).toHaveBeenCalledTimes(1);
});
