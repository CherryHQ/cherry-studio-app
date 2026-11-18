import { parseAnydocDocument } from '@/backend/services/file/anydocParser';
import type { FileEntryId } from '@/shared/data/types/file';

import type { ManagedFileFact, ManagedFileResolver } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeTool } from '../../runtime';
import { createFileLibraryTools } from '../fileLibraryTools';
import {
  createReadFileContentReader,
  createReadFileTool,
  READ_FILE_MAX_CACHED_BYTES,
} from '../readFileTool';
import type { WorkspaceFileAccess } from '../workspaceFileAccess';

jest.mock('@/backend/services/file/anydocParser', () => ({
  ANYDOC_PARSER_VERSION: '0.4.1',
  parseAnydocDocument: jest.fn(),
}));

const FILE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const OTHER_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const input = { file_entry_id: FILE_ID };
const converted = (text: string) => ({
  status: 'ok' as const,
  ir: { text },
  warnings: [],
  assets: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(parseAnydocDocument).mockResolvedValue(converted('body'));
});

function setup() {
  const source: ManagedFileFact = {
    fileEntryId: FILE_ID,
    revision: 1,
    mediaType: 'application/rtf',
    name: 'report.rtf',
    size: 1,
  };
  const files = {
    resolveAvailable: jest.fn(async () => new Map([[FILE_ID, source]])),
    readAsBytes: jest.fn<
      ReturnType<ManagedFileResolver['readAsBytes']>,
      Parameters<ManagedFileResolver['readAsBytes']>
    >(async () => Uint8Array.of(1)),
    readAsDataUrl: jest.fn(async () => undefined),
    readDocumentText: jest.fn<
      ReturnType<ManagedFileResolver['readDocumentText']>,
      Parameters<ManagedFileResolver['readDocumentText']>
    >(async () => undefined),
    readImageText: jest.fn(async () => undefined),
  } satisfies ManagedFileResolver;
  const approveLibraryRead = jest.fn();
  const access = { folderId: null, approveLibraryRead } as unknown as WorkspaceFileAccess;
  const reader = (readContent?: ReturnType<typeof createReadFileContentReader>) =>
    createFileLibraryTools(access, files, 'anydoc', undefined, true, readContent).find(
      (tool) => tool.providerName === 'library_read_file',
    )!;
  return { files, source, approveLibraryRead, reader, tool: reader() };
}

function execute(
  tool: RuntimeTool,
  args: RuntimeJsonValue = input,
  signal = new AbortController().signal,
  toolCallId = 'call-1',
) {
  return tool.execute({ input: args, signal, toolCallId, turnId: 'turn-1' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('library windows reuse one whole-document parse and concatenate to the original JSON', async () => {
  const { files, tool, approveLibraryRead } = setup();
  const first = await execute(tool, { ...input, max_characters: 5 });
  const second = await execute(tool, { ...input, offset: 5 });

  expect((first.value as { text: string }).text + (second.value as { text: string }).text).toBe(
    JSON.stringify({ text: 'body' }),
  );
  expect(second.value).toMatchObject({ status: 'ok', fileEntryId: FILE_ID, revision: 1 });
  expect(files.readAsBytes).toHaveBeenCalledTimes(1);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(1);
  expect(files.resolveAvailable).toHaveBeenCalledTimes(2);
  expect(approveLibraryRead).toHaveBeenCalledTimes(2);
});

test('cached content stays unavailable after the managed file disappears', async () => {
  const { files, tool, approveLibraryRead } = setup();
  await execute(tool);
  files.resolveAvailable.mockResolvedValueOnce(new Map());
  expect((await execute(tool)).value).toMatchObject({
    status: 'error',
    message: 'The managed file is unavailable.',
  });
  expect(approveLibraryRead).toHaveBeenCalledTimes(1);
});

test('cancellation during live availability resolution cannot return or approve cached content', async () => {
  const { files, tool, source, approveLibraryRead } = setup();
  await execute(tool);
  const controller = new AbortController();
  files.resolveAvailable.mockImplementationOnce(async () => {
    controller.abort(new Error('stopped'));
    return new Map([[FILE_ID, source]]);
  });
  await expect(execute(tool, input, controller.signal)).rejects.toThrow('stopped');
  await expect(execute(tool, input, controller.signal)).rejects.toThrow('stopped');
  expect(files.resolveAvailable).toHaveBeenCalledTimes(2);
  expect(approveLibraryRead).toHaveBeenCalledTimes(1);
});

test('same-name versions have separate content and only the last document is retained', async () => {
  const { files, tool, source } = setup();
  files.resolveAvailable.mockResolvedValue(
    new Map([
      [FILE_ID, source],
      [OTHER_ID, { ...source, fileEntryId: OTHER_ID }],
    ]),
  );
  jest
    .mocked(parseAnydocDocument)
    .mockResolvedValueOnce(converted('first'))
    .mockResolvedValueOnce(converted('second'))
    .mockResolvedValueOnce(converted('first'));

  expect((await execute(tool)).value).toMatchObject({ text: '{"text":"first"}' });
  expect((await execute(tool, { file_entry_id: OTHER_ID })).value).toMatchObject({
    fileEntryId: OTHER_ID,
    text: '{"text":"second"}',
  });
  expect((await execute(tool)).value).toMatchObject({ text: '{"text":"first"}' });
  expect(files.readAsBytes).toHaveBeenCalledTimes(3);
});

test('a changed revision does not reuse an older parse of the same entry', async () => {
  const { tool, source } = setup();
  await execute(tool);
  source.revision = 2;
  jest.mocked(parseAnydocDocument).mockResolvedValueOnce(converted('new revision'));
  expect((await execute(tool)).value).toMatchObject({
    revision: 2,
    text: '{"text":"new revision"}',
  });
  expect(parseAnydocDocument).toHaveBeenCalledTimes(2);
});

test('read_file shares parsed content without gaining library authorization', async () => {
  const { files, reader } = setup();
  const readContent = createReadFileContentReader(files, 'anydoc');
  await execute(reader(readContent));
  const ids = new Set<string>();
  const direct = createReadFileTool(
    files,
    { fileEntryIds: ids },
    'anydoc',
    undefined,
    true,
    readContent,
  );
  expect((await execute(direct)).value).toMatchObject({ status: 'error' });
  expect(ids.size).toBe(0);
  expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
  ids.add(FILE_ID);
  expect((await execute(direct)).value).toMatchObject({ status: 'ok', text: '{"text":"body"}' });
  ids.delete(FILE_ID);
  expect((await execute(direct)).value).toMatchObject({ status: 'error' });
  expect(files.readAsBytes).toHaveBeenCalledTimes(1);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(1);
});

test('failed conversion is retried and only a successful read authorizes editing', async () => {
  const { files, tool, approveLibraryRead } = setup();
  jest.mocked(parseAnydocDocument).mockResolvedValueOnce({
    status: 'fallback',
    reason: 'parse-error',
    detail: 'invalid document',
  });
  expect((await execute(tool)).value).toMatchObject({ status: 'error', parser: 'anydoc' });
  expect(approveLibraryRead).not.toHaveBeenCalled();
  expect((await execute(tool)).value).toMatchObject({ status: 'ok' });
  await execute(tool);
  expect(files.readAsBytes).toHaveBeenCalledTimes(2);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(2);
  expect(approveLibraryRead).toHaveBeenCalledTimes(2);
});

test('concurrent windows share parsing while either caller may cancel its own wait', async () => {
  const { files, tool } = setup();
  const started = deferred<void>();
  const native = deferred<Awaited<ReturnType<typeof parseAnydocDocument>>>();
  jest.mocked(parseAnydocDocument).mockImplementationOnce(() => {
    started.resolve();
    return native.promise;
  });
  const controller = new AbortController();
  const first = execute(tool, input, controller.signal, 'first');
  const second = execute(tool, { ...input, offset: 5 }, new AbortController().signal, 'second');
  await started.promise;
  const parseSignal = files.readAsBytes.mock.calls[0]![1];
  const stopped = expect(first).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(parseSignal.aborted).toBe(false);
  native.resolve(converted('body'));
  expect((await second).value).toMatchObject({ status: 'ok', text: 't":"body"}' });
  await execute(tool);
  expect(files.readAsBytes).toHaveBeenCalledTimes(1);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(1);
});

test('cancelling all consumers aborts parsing and a later read starts fresh', async () => {
  const { files, tool } = setup();
  const started = deferred<void>();
  const native = deferred<Awaited<ReturnType<typeof parseAnydocDocument>>>();
  jest.mocked(parseAnydocDocument).mockImplementationOnce(() => {
    started.resolve();
    return native.promise;
  });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = execute(tool, input, firstController.signal, 'first');
  const second = execute(tool, input, secondController.signal, 'second');
  await started.promise;
  const parseSignal = files.readAsBytes.mock.calls[0]![1];
  const firstStopped = expect(first).rejects.toThrow('first stopped');
  firstController.abort(new Error('first stopped'));
  await firstStopped;
  expect(parseSignal.aborted).toBe(false);
  const secondStopped = expect(second).rejects.toThrow('second stopped');
  secondController.abort(new Error('second stopped'));
  await secondStopped;
  expect(parseSignal.aborted).toBe(true);
  expect((await execute(tool)).value).toMatchObject({ status: 'ok' });
  native.resolve(converted('late cancelled result'));
  expect((await execute(tool)).value).toMatchObject({ status: 'ok', text: '{"text":"body"}' });
  expect(files.readAsBytes).toHaveBeenCalledTimes(2);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(2);
});

test('documents above the retained payload budget remain readable without being cached', async () => {
  const { files, tool } = setup();
  jest
    .mocked(parseAnydocDocument)
    .mockResolvedValue(converted('x'.repeat(READ_FILE_MAX_CACHED_BYTES / 2)));
  expect((await execute(tool, { ...input, max_characters: 1 })).value).toMatchObject({
    status: 'ok',
    text: '{',
  });
  expect((await execute(tool, { ...input, offset: 1, max_characters: 1 })).value).toMatchObject({
    status: 'ok',
    text: '"',
  });
  expect(files.readAsBytes).toHaveBeenCalledTimes(2);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(2);
});

test('a new turn reader starts without the previous turn content', async () => {
  const { files, tool, reader } = setup();
  await execute(tool);
  await execute(reader());
  expect(files.readAsBytes).toHaveBeenCalledTimes(2);
  expect(parseAnydocDocument).toHaveBeenCalledTimes(2);
});

test('rewritten plain-text drafts are read live instead of retaining old text', async () => {
  const { source, files, tool } = setup();
  source.mediaType = 'text/markdown';
  source.name = 'notes.md';
  source.size = 5;
  files.readAsBytes.mockResolvedValueOnce(new TextEncoder().encode('first'));
  files.readAsBytes.mockResolvedValueOnce(new TextEncoder().encode('later'));
  expect((await execute(tool)).value).toMatchObject({ text: 'first' });
  expect((await execute(tool)).value).toMatchObject({ text: 'later' });
  expect(files.readAsBytes).toHaveBeenCalledTimes(2);
  expect(parseAnydocDocument).not.toHaveBeenCalled();
});
