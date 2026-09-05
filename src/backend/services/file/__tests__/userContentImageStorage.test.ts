import { createUserContentImageStorage } from '../userContentImageStorage';

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Map<string, number>();
  const joinUri = (parts: (string | { uri: string })[], isDirectory: boolean) => {
    const [first, ...rest] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    let uri = first?.replace(/\/+$/, '') ?? '';

    for (const part of rest) {
      uri += `/${part.replace(/^\/+|\/+$/g, '')}`;
    }

    return isDirectory ? `${uri}/` : uri;
  };

  class MockDirectory {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, true);
    }

    get exists() {
      return directories.has(this.uri);
    }

    create() {
      directories.add(this.uri);
    }
  }

  class MockFile {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, false);
    }

    get exists() {
      return files.has(this.uri);
    }

    get size() {
      return files.get(this.uri) ?? null;
    }

    async copy(destination: MockFile) {
      await Promise.resolve();

      const sourceSize = files.get(this.uri);
      if (sourceSize === undefined) {
        throw new Error(`Source file does not exist: ${this.uri}`);
      }

      files.set(destination.uri, sourceSize);
    }

    delete() {
      files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: { uri: 'file:///documents/' } },
    testState: { directories, files },
  };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { WEBP: 'webp' },
}));

const STORED_NAME_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/i;
const userAvatarConfig = {
  directoryName: 'user-avatar',
  storedNamePattern: STORED_NAME_PATTERN,
};
const sourceUri = 'file:///picker/avatar.jpg';
const normalizedUri = 'file:///cache/avatar.webp';
const { testState: fileSystemState } = jest.requireMock<{
  testState: { directories: Set<string>; files: Map<string, number> };
}>('expo-file-system');
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');

describe('userContentImageStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fileSystemState.directories.clear();
    fileSystemState.files.clear();
  });

  it('center-crops, normalizes, and stores an avatar WebP under user-avatar', async () => {
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
    const storage = createUserContentImageStorage(userAvatarConfig);

    const storedName = await storage.create(sourceUri);

    expect(storedName).toMatch(STORED_NAME_PATTERN);
    expect(outputContext.crop).toHaveBeenCalledWith({
      height: 1200,
      originX: 200,
      originY: 0,
      width: 1200,
    });
    expect(outputContext.resize).toHaveBeenCalledWith({ height: 1024, width: 1024 });
    expect(outputImage.saveAsync).toHaveBeenCalledWith({ compress: 0.82, format: 'webp' });
    expect(fileSystemState.files.has(`file:///documents/user-avatar/${storedName}`)).toBe(true);
    expect(fileSystemState.files.has(normalizedUri)).toBe(false);

    await expect(storage.resolve(storedName)).resolves.toBe(
      `file:///documents/user-avatar/${storedName}`,
    );
    await expect(storage.remove(storedName)).resolves.toBe(true);
    await expect(storage.resolve(storedName)).resolves.toBeUndefined();
    await expect(storage.remove(storedName)).resolves.toBe(false);
  });

  it('rejects oversized picker files before decoding them', async () => {
    fileSystemState.files.set(sourceUri, 10 * 1024 * 1024 + 1);
    const storage = createUserContentImageStorage(userAvatarConfig);

    await expect(storage.create(sourceUri)).rejects.toThrow('exceeds the 10 MB limit');

    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('refuses names outside the stored avatar pattern', async () => {
    fileSystemState.files.set('file:///documents/user-avatar/escape.webp', 1);
    const storage = createUserContentImageStorage(userAvatarConfig);

    await expect(storage.resolve('../Data/Files/escape.webp')).resolves.toBeUndefined();
    await expect(storage.remove('escape.webp')).resolves.toBe(false);
  });
});
