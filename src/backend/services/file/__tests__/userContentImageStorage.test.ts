import { FileEntryIdSchema } from '@cherrystudio/universal/data/types/file';

import { createUserContentImageStorage } from '../userContentImageStorage';

jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();

  class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists() {
      return files.has(this.uri);
    }

    get size() {
      return files.get(this.uri) ?? null;
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return { File: MockFile, testState: { files } };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { WEBP: 'webp' },
}));

jest.mock('../fileStorage', () => ({
  createInternalEntry: jest.fn(),
  discardInternalEntries: jest.fn(),
  getFileUri: jest.fn(),
}));

const storedId = FileEntryIdSchema.parse('00000000-0000-4000-8000-000000000001');
const sourceUri = 'file:///picker/avatar.jpg';
const normalizedUri = 'file:///cache/avatar.webp';
const { testState: fileSystemState } = jest.requireMock<{
  testState: { files: Map<string, number> };
}>('expo-file-system');
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');
const fileStorage = jest.requireMock<{
  createInternalEntry: jest.Mock;
  discardInternalEntries: jest.Mock;
  getFileUri: jest.Mock;
}>('../fileStorage');

describe('userContentImageStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fileSystemState.files.clear();
  });

  it('center-crops, normalizes, and stores an avatar as a managed WebP', async () => {
    fileSystemState.files.set(sourceUri, 4 * 1024 * 1024);
    fileSystemState.files.set(normalizedUri, 320 * 1024);
    const sourceImage = { height: 1200, release: jest.fn(), width: 1600 };
    const outputImage = {
      release: jest.fn(),
      saveAsync: jest.fn(async () => ({ height: 1024, uri: normalizedUri, width: 1024 })),
    };
    const sourceContext = { release: jest.fn(), renderAsync: jest.fn(async () => sourceImage) };
    const outputContext = {
      crop: jest.fn(),
      release: jest.fn(),
      renderAsync: jest.fn(async () => outputImage),
      resize: jest.fn(),
    };
    outputContext.crop.mockReturnValue(outputContext);
    outputContext.resize.mockReturnValue(outputContext);
    ImageManipulator.manipulate
      .mockReturnValueOnce(sourceContext)
      .mockReturnValueOnce(outputContext);
    fileStorage.createInternalEntry.mockResolvedValue({ id: storedId, origin: 'internal' });
    const storage = createUserContentImageStorage(createEntries());

    await expect(storage.create(sourceUri)).resolves.toBe(storedId);

    expect(outputContext.crop).toHaveBeenCalledWith({
      height: 1200,
      originX: 200,
      originY: 0,
      width: 1200,
    });
    expect(outputContext.resize).toHaveBeenCalledWith({ height: 1024, width: 1024 });
    expect(outputImage.saveAsync).toHaveBeenCalledWith({ compress: 0.82, format: 'webp' });
    expect(fileStorage.createInternalEntry).toHaveBeenCalledWith(expect.any(Object), {
      cleanupPolicy: 'manual',
      name: 'avatar.webp',
      source: 'uri',
      uri: normalizedUri,
    });
    expect(fileSystemState.files.has(normalizedUri)).toBe(false);
  });

  it('rejects oversized picker files before decoding them', async () => {
    fileSystemState.files.set(sourceUri, 10 * 1024 * 1024 + 1);
    const storage = createUserContentImageStorage(createEntries());

    await expect(storage.create(sourceUri)).rejects.toThrow('exceeds the 10 MB limit');

    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
    expect(fileStorage.createInternalEntry).not.toHaveBeenCalled();
  });
});

function createEntries(): Parameters<typeof createUserContentImageStorage>[0] {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
  } as unknown as Parameters<typeof createUserContentImageStorage>[0];
}
