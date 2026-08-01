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

  test('uses a managed file URI without reading the persisted URL', async () => {
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

  test('drops a managed attachment when its entry cannot be resolved', async () => {
    testState.contents.set('file:///legacy/brief.pdf', { base64: 'legacy', type: '' });

    const [message] = await resolveUIMessageFileUrls(
      [createMessage([filePart('file:///legacy/brief.pdf', 'entry-1')])],
      async () => undefined,
    );

    expect(message.parts).toEqual([]);
    expect(testState.reads).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '[fileProcessor] Managed file entry is unavailable',
      { fileEntryId: 'entry-1' },
    );
  });

  test('does not read the persisted URL after a managed file read fails', async () => {
    testState.contents.set('file:///legacy/brief.pdf', { base64: 'legacy', type: '' });

    const [message] = await resolveUIMessageFileUrls(
      [createMessage([filePart('file:///legacy/brief.pdf', 'entry-1')])],
      async () => 'file:///new-sandbox/files/missing.pdf',
    );

    expect(message.parts).toEqual([]);
    expect(testState.reads).toEqual(['file:///new-sandbox/files/missing.pdf']);
  });

  test('drops only unreadable managed attachments', async () => {
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
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
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
