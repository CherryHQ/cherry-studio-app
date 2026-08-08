import type { QuickLookThumbnailInput } from '../quickLookThumbnailCache.ios';

const mockGenerateThumbnail = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: {
    generateThumbnail: (input: unknown) => mockGenerateThumbnail(input),
  },
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
  typeof import('../quickLookThumbnailCache.ios')
>('../quickLookThumbnailCache.ios');
const { testState } = jest.requireMock<{
  testState: { directories: Set<string>; files: Set<string> };
}>('expo-file-system');

const input: QuickLookThumbnailInput = {
  entryId: '00000000-0000-7000-8000-000000000001',
  height: 52,
  scale: 3,
  updatedAt: 42,
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
    mockGenerateThumbnail.mockResolvedValue({
      height: 156,
      uri: 'file:///tmp/generated.png',
      width: 336,
    });

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

  it('changes keys when the file version or requested size changes', () => {
    expect(quickLookThumbnailCacheKey(input)).not.toBe(
      quickLookThumbnailCacheKey({ ...input, updatedAt: input.updatedAt + 1 }),
    );
    expect(quickLookThumbnailCacheKey(input)).not.toBe(
      quickLookThumbnailCacheKey({ ...input, width: 160 }),
    );
  });
});
