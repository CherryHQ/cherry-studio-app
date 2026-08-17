import type { QuickLookThumbnailInput } from '../utils/quick-look-thumbnail-cache.ios';

const mockGenerateThumbnail = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { generateThumbnail: (input: unknown) => mockGenerateThumbnail(input) },
}));

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Set<string>();
  const join = (parts: (string | { uri: string })[], directory: boolean) => {
    const values = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    const uri = values.reduce(
      (result, value) => `${result.replace(/\/$/, '')}/${value.replace(/^\//, '')}`,
    );
    return directory ? `${uri.replace(/\/$/, '')}/` : uri;
  };

  class MockDirectory {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts, true);
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
      this.uri = join(parts, false);
    }

    get exists() {
      return files.has(this.uri);
    }

    delete() {
      files.delete(this.uri);
    }

    async move(destination: MockFile) {
      files.delete(this.uri);
      files.add(destination.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: 'file:///cache/' } },
    testState: { directories, files },
  };
});

const { getQuickLookThumbnail, quickLookThumbnailCacheKey } = jest.requireActual<
  typeof import('../utils/quick-look-thumbnail-cache.ios')
>('../utils/quick-look-thumbnail-cache.ios');
const { testState } = jest.requireMock<{
  testState: { directories: Set<string>; files: Set<string> };
}>('expo-file-system');

const input: QuickLookThumbnailInput = {
  height: 52,
  id: 'managed/file:1',
  revision: 42,
  scale: 3,
  uri: 'file:///documents/brief.pdf',
  width: 112,
};

describe('Quick Look thumbnail cache', () => {
  beforeEach(() => {
    mockGenerateThumbnail.mockReset();
    testState.directories.clear();
    testState.files.clear();
  });

  it('coalesces generation and reuses the deterministic disk cache', async () => {
    testState.files.add('file:///tmp/generated.png');
    mockGenerateThumbnail.mockResolvedValue({ uri: 'file:///tmp/generated.png' });

    const [first, second] = await Promise.all([
      getQuickLookThumbnail(input),
      getQuickLookThumbnail(input),
    ]);

    expect(first).toBe(second);
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
    expect(mockGenerateThumbnail).toHaveBeenCalledWith({
      scale: 3,
      size: { height: 52, width: 112 },
      uri: input.uri,
    });
    await expect(getQuickLookThumbnail(input)).resolves.toBe(first);
    expect(mockGenerateThumbnail).toHaveBeenCalledTimes(1);
  });

  it('uses filename-safe identity and changes with revision or size', () => {
    const key = quickLookThumbnailCacheKey(input);

    expect(key).not.toContain('/');
    expect(key).not.toBe(quickLookThumbnailCacheKey({ ...input, revision: 43 }));
    expect(key).not.toBe(quickLookThumbnailCacheKey({ ...input, width: 160 }));
  });
});
