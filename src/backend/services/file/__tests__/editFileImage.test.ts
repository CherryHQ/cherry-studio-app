import { FileEntrySchema } from '@/shared/data/types/file';

import { editFileImage } from '../editFileImage';
import { generateFilePreviewUri } from '../filePreviewStorage';
import { createInternalEntry, discardInternalEntries, resolveFileEntry } from '../fileStorage';

jest.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    delete = mockDeleteTemporary;
  },
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('../filePreviewStorage', () => ({ generateFilePreviewUri: jest.fn() }));
jest.mock('../fileStorage', () => ({
  createInternalEntry: jest.fn(),
  discardInternalEntries: jest.fn(),
  resolveFileEntry: jest.fn(),
}));

const mockDeleteTemporary = jest.fn();
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');
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
    filename: 'photo v2.png',
  }),
  uri: 'file:///managed/photo-v2.png',
};
const edit = {
  fileEntryId: source.entry.id,
  rotation: 90 as const,
  crop: { x: 0.25, y: 0.1, width: 0.75, height: 0.8 },
};

function nativeImages() {
  const rotated = { width: 600, height: 800, release: jest.fn() };
  const cropped = {
    release: jest.fn(),
    saveAsync: jest.fn(async () => ({ uri: 'file:///cache/edit.png' })),
  };
  const context = {
    rotate: jest.fn(),
    renderAsync: jest.fn(async () => rotated),
    release: jest.fn(),
  };
  const cropContext = {
    crop: jest.fn(),
    renderAsync: jest.fn(async () => cropped),
    release: jest.fn(),
  };
  ImageManipulator.manipulate.mockReturnValueOnce(context).mockReturnValueOnce(cropContext);
  return { rotated, cropped, context, cropContext };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(resolveFileEntry).mockResolvedValueOnce(source).mockResolvedValue(replacement);
  jest.mocked(createInternalEntry).mockResolvedValue(replacement.entry);
});

test('crops rotated pixel bounds into a new file and preserves the source ownership', async () => {
  const native = nativeImages();
  await expect(editFileImage(edit)).resolves.toEqual(replacement);
  expect(native.context.rotate).toHaveBeenCalledWith(90);
  expect(native.cropContext.crop).toHaveBeenCalledWith({
    originX: 150,
    originY: 80,
    width: 450,
    height: 640,
  });
  expect(native.cropped.saveAsync).toHaveBeenCalledWith({ compress: 1, format: 'png' });
  expect(createInternalEntry).toHaveBeenCalledWith(
    {},
    {
      source: 'uri',
      uri: 'file:///cache/edit.png',
      name: 'photo v2.png',
      mediaType: 'image/png',
      provenance: 'imported',
    },
    undefined,
  );
  expect(discardInternalEntries).not.toHaveBeenCalled();
  expect(mockDeleteTemporary).toHaveBeenCalledTimes(1);
  for (const resource of Object.values(native)) expect(resource.release).toHaveBeenCalledTimes(1);
});

test('aborting after encoding releases cache bytes before any managed file is written', async () => {
  const native = nativeImages();
  const controller = new AbortController();
  native.cropped.saveAsync.mockImplementation(async () => {
    controller.abort();
    return { uri: 'file:///cache/edit.png' };
  });
  await expect(editFileImage(edit, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(createInternalEntry).not.toHaveBeenCalled();
  expect(mockDeleteTemporary).toHaveBeenCalledTimes(1);
  for (const resource of Object.values(native)) expect(resource.release).toHaveBeenCalledTimes(1);
});

test('aborting after storage removes only the derivative and skips thumbnail work', async () => {
  nativeImages();
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
});

test('a preview failure after storage cannot leave an orphaned edit', async () => {
  nativeImages();
  jest.mocked(generateFilePreviewUri).mockRejectedValue(new Error('preview storage failed'));
  await expect(editFileImage(edit)).rejects.toThrow('preview storage failed');
  expect(discardInternalEntries).toHaveBeenCalledWith({}, [replacement.entry]);
  expect(mockDeleteTemporary).toHaveBeenCalledTimes(1);
});
