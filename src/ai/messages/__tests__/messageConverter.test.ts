import type { UIMessage } from 'ai';
import { resolveUIMessageFileUrls } from '../messageConverter';

jest.mock('expo-file-system', () => {
  const contents = new Map<string, { base64: string; type: string }>();
  const reads: string[] = [];

  class MockFile {
    readonly uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    get type() {
      return contents.get(this.uri)?.type ?? '';
    }

    async base64() {
      reads.push(this.uri);
      const content = contents.get(this.uri);
      if (!content) {
        throw new Error(`missing file: ${this.uri}`);
      }
      return content.base64;
    }
  }

  return { File: MockFile, testState: { contents, reads } };
});

type FileSystemTestState = {
  contents: Map<string, { base64: string; type: string }>;
  reads: string[];
};

const { testState } = jest.requireMock<{ testState: FileSystemTestState }>('expo-file-system');

describe('resolveUIMessageFileUrls', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    testState.contents.clear();
    testState.reads.length = 0;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  test('prefers a managed file URI over the persisted fallback URL', async () => {
    testState.contents.set('file:///new-sandbox/files/entry.png', {
      base64: 'managed',
      type: 'image/png',
    });
    const resolveFileEntryUri = jest.fn(async () => 'file:///new-sandbox/files/entry.png');

    const [message] = await resolveUIMessageFileUrls(
      [createMessage([filePart('file:///old-sandbox/image.jpg', 'entry-1')])],
      resolveFileEntryUri,
    );

    expect(resolveFileEntryUri).toHaveBeenCalledWith('entry-1');
    expect(message.parts[0]).toEqual(
      expect.objectContaining({ mediaType: 'image/png', url: 'data:image/png;base64,managed' }),
    );
    expect(testState.reads).toEqual(['file:///new-sandbox/files/entry.png']);
  });

  test('falls back to the wire URL when the entry cannot be resolved', async () => {
    testState.contents.set('file:///legacy/brief.pdf', { base64: 'legacy', type: '' });

    const [message] = await resolveUIMessageFileUrls(
      [createMessage([filePart('file:///legacy/brief.pdf', 'entry-1')])],
      async () => undefined,
    );

    expect(message.parts[0]).toEqual(
      expect.objectContaining({
        mediaType: 'application/pdf',
        url: 'data:application/pdf;base64,legacy',
      }),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '[fileProcessor] Managed file entry is unavailable',
      { fileEntryId: 'entry-1' },
    );
  });

  test('uses the fallback URL after a managed file read fails', async () => {
    testState.contents.set('file:///legacy/brief.pdf', { base64: 'legacy', type: '' });

    const [message] = await resolveUIMessageFileUrls(
      [createMessage([filePart('file:///legacy/brief.pdf', 'entry-1')])],
      async () => 'file:///new-sandbox/files/missing.pdf',
    );

    expect(message.parts[0]).toEqual(
      expect.objectContaining({ url: 'data:application/pdf;base64,legacy' }),
    );
    expect(testState.reads).toEqual([
      'file:///new-sandbox/files/missing.pdf',
      'file:///legacy/brief.pdf',
    ]);
  });

  test('drops only attachments whose managed and fallback files are both unreadable', async () => {
    const message = createMessage([
      { text: 'keep me', type: 'text' },
      filePart('file:///legacy/missing.pdf', 'entry-1'),
      {
        filename: 'remote.pdf',
        mediaType: 'application/pdf',
        type: 'file',
        url: 'https://example.com/remote.pdf',
      },
    ]);

    const [resolved] = await resolveUIMessageFileUrls(
      [message],
      async () => 'file:///new-sandbox/files/missing.pdf',
    );

    expect(resolved.parts).toEqual([
      { text: 'keep me', type: 'text' },
      expect.objectContaining({ url: 'https://example.com/remote.pdf' }),
    ]);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
  });
});

function createMessage(parts: UIMessage['parts']): UIMessage {
  return { id: 'message-1', parts, role: 'user' };
}

function filePart(url: string, fileEntryId: string): UIMessage['parts'][number] {
  return {
    filename: 'brief.pdf',
    mediaType: 'application/pdf',
    providerMetadata: { cherry: { fileEntryId } },
    type: 'file',
    url,
  };
}
