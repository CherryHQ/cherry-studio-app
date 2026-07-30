import type { FileUIPart } from '@/shared/data/types/message';
import { resolveFilePartUri } from '../useFilePartUri';

jest.mock('@/frontend/data/hooks', () => ({ useDataQuery: jest.fn() }));

jest.mock('expo-file-system', () => {
  const files = new Set<string>();

  class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get exists() {
      return files.has(this.uri);
    }
  }

  return { File: MockFile, testState: { files } };
});

const { testState } = jest.requireMock<{ testState: { files: Set<string> } }>('expo-file-system');

describe('resolveFilePartUri', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    testState.files.clear();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  test('prefers the URI rebuilt from a managed file entry', async () => {
    const resolver = jest.fn(async () => 'file:///new-sandbox/files/entry.png');

    await expect(
      resolveFilePartUri(filePart('file:///old-sandbox/image.png'), resolver),
    ).resolves.toBe('file:///new-sandbox/files/entry.png');
  });

  test('does not use the persisted URL when the managed entry is unavailable', async () => {
    testState.files.add('file:///legacy/image.png');

    await expect(
      resolveFilePartUri(filePart('file:///legacy/image.png'), async () => undefined),
    ).resolves.toBeUndefined();
  });

  test('returns undefined when the managed entry resolver fails', async () => {
    await expect(
      resolveFilePartUri(filePart('file:///legacy/image.png'), async () => {
        throw new Error('database unavailable');
      }),
    ).resolves.toBeUndefined();
  });
});

function filePart(url: string): FileUIPart {
  return {
    filename: 'image.png',
    mediaType: 'image/png',
    providerMetadata: { cherry: { fileEntryId: 'entry-1' } },
    type: 'file',
    url,
  };
}
