import { FileEntrySchema, type FileEntryId } from '@/shared/data/types/file';

import type { ManagedFileFact } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createEditFileTool as createTool,
  EDIT_FILE_MAX_CONTENT_BYTES,
  EDIT_FILE_SNIPPET_MAX_CHARACTERS,
  type EditFileFiles,
  type TurnEditScope,
} from '../editFileTool';

const SOURCE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const EDITED_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const NO_DRAFTS: TurnEditScope = { availableFiles: new Map(), draftFileEntryIds: new Set() };
const SOURCE_IS_DRAFT: TurnEditScope = {
  availableFiles: new Map(),
  draftFileEntryIds: new Set([SOURCE_ID]),
};

function createEditFileTool(files: EditFileFiles, scope: TurnEditScope = NO_DRAFTS) {
  return createTool(files, scope);
}

describe('editFileTool', () => {
  test('saves a new version after one exact replacement of a historical file', async () => {
    const files = createFiles('Hello world\n');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'world',
      new_string: 'Cherry',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith({
      data: 'Hello Cherry\n',
      mediaType: 'text/markdown',
      name: 'notes v2.md',
      provenance: 'generated',
    });
    expect(files.rewriteTextEntry).not.toHaveBeenCalled();
    expect(output).toEqual({
      value: {
        status: 'edited',
        sourceFileEntryId: SOURCE_ID,
        fileEntryId: EDITED_ID,
        filename: 'notes v2.md',
        size: 13,
        replacements: 1,
        snippet: 'Hello Cherry\n',
        snippetStartLine: 1,
      },
      artifacts: [
        {
          ref: { kind: 'managed-file', fileEntryId: EDITED_ID },
          mediaType: 'text/markdown',
          name: 'notes v2.md',
          kind: 'derived',
        },
      ],
    });
  });

  test('rewrites a draft this turn produced in place and adds no artifact', async () => {
    const files = createFiles('Hello world\n');
    const output = await execute(createEditFileTool(files, SOURCE_IS_DRAFT), {
      file_entry_id: SOURCE_ID,
      old_string: 'world',
      new_string: 'Cherry',
    });

    expect(files.rewriteTextEntry).toHaveBeenCalledWith({ data: 'Hello Cherry\n', id: SOURCE_ID });
    expect(files.createTextEntry).not.toHaveBeenCalled();
    expect(output).toEqual({
      value: {
        status: 'edited',
        sourceFileEntryId: SOURCE_ID,
        fileEntryId: SOURCE_ID,
        filename: 'notes.md',
        size: 13,
        replacements: 1,
        snippet: 'Hello Cherry\n',
        snippetStartLine: 1,
      },
      artifacts: [],
    });
  });

  test('returns the edited region with two lines of context on each side', async () => {
    const files = createFiles('l1\nl2\nl3\nl4 old\nl5\nl6\nl7\n');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'old',
      new_string: 'new',
    });

    expect(output.value).toMatchObject({
      snippet: 'l2\nl3\nl4 new\nl5\nl6\n',
      snippetStartLine: 2,
    });
  });

  test('caps the snippet when the replacement itself is long', async () => {
    const files = createFiles('x');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'x',
      new_string: 'y'.repeat(EDIT_FILE_SNIPPET_MAX_CHARACTERS + 10),
    });

    expect(output.value).toMatchObject({
      snippet: `${'y'.repeat(EDIT_FILE_SNIPPET_MAX_CHARACTERS)}…`,
      snippetStartLine: 1,
    });
  });

  test('serializes edits of one draft batched in the same message', async () => {
    const files = createFiles('alpha\nbeta\n');
    const tool = createEditFileTool(files, SOURCE_IS_DRAFT);

    const outputs = await Promise.all([
      execute(tool, { file_entry_id: SOURCE_ID, old_string: 'alpha', new_string: 'ALPHA' }),
      execute(tool, { file_entry_id: SOURCE_ID, old_string: 'beta', new_string: 'BETA' }),
    ]);

    // The second edit reads what the first wrote, in the order the model listed
    // them, so neither replacement is dropped.
    expect(files.rewriteTextEntry).toHaveBeenNthCalledWith(1, {
      data: 'ALPHA\nbeta\n',
      id: SOURCE_ID,
    });
    expect(files.rewriteTextEntry).toHaveBeenNthCalledWith(2, {
      data: 'ALPHA\nBETA\n',
      id: SOURCE_ID,
    });
    expect(outputs.map((output) => (output.value as { status: string }).status)).toEqual([
      'edited',
      'edited',
    ]);
  });

  test('routes a source and the version derived from it through one queue', async () => {
    const files = createFiles('alpha\nbeta\ngamma\n');
    const drafts = new Set<string>();
    const tool = createEditFileTool(files, {
      availableFiles: new Map(),
      draftFileEntryIds: drafts,
    });
    await execute(tool, { file_entry_id: SOURCE_ID, old_string: 'alpha', new_string: 'ALPHA' });
    drafts.add(EDITED_ID); // the catalog wrapper grants the artifact it produced

    // The model now holds both ids and may batch an edit to each; they are the
    // same file.
    await Promise.all([
      execute(tool, { file_entry_id: SOURCE_ID, old_string: 'beta', new_string: 'BETA' }),
      execute(tool, { file_entry_id: EDITED_ID, old_string: 'gamma', new_string: 'GAMMA' }),
    ]);

    expect(files.createTextEntry).toHaveBeenCalledTimes(1);
    expect(files.rewriteTextEntry).toHaveBeenLastCalledWith({
      data: 'ALPHA\nBETA\nGAMMA\n',
      id: EDITED_ID,
    });
  });

  test('continues its own version when the same historical source is edited again', async () => {
    const files = createFiles('alpha\nbeta\n');
    const tool = createEditFileTool(files);

    const first = await execute(tool, {
      file_entry_id: SOURCE_ID,
      old_string: 'alpha',
      new_string: 'ALPHA',
    });
    const second = await execute(tool, {
      file_entry_id: SOURCE_ID,
      old_string: 'beta',
      new_string: 'BETA',
    });

    expect(files.createTextEntry).toHaveBeenCalledTimes(1);
    expect(files.rewriteTextEntry).toHaveBeenCalledWith({ data: 'ALPHA\nBETA\n', id: EDITED_ID });
    expect(first.artifacts).toHaveLength(1);
    expect(second.artifacts).toHaveLength(0);
    expect(second.value).toMatchObject({ fileEntryId: EDITED_ID, filename: 'notes v2.md' });
  });

  test('skips a version number already used in the Session', async () => {
    const files = createFiles('Hello world\n');
    const scope: TurnEditScope = {
      availableFiles: new Map([
        [
          EDITED_ID,
          { fileEntryId: EDITED_ID, mediaType: 'text/markdown', name: 'notes v2.md', size: 1 },
        ],
      ]),
      draftFileEntryIds: new Set(),
    };
    await execute(createEditFileTool(files, scope), {
      file_entry_id: SOURCE_ID,
      old_string: 'world',
      new_string: 'Cherry',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notes v3.md' }),
    );
  });

  test('keeps the change in the snippet when the surrounding line is long', async () => {
    const filler = 'z'.repeat(EDIT_FILE_SNIPPET_MAX_CHARACTERS);
    const files = createFiles(`${filler} old ${filler}`);
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'old',
      new_string: 'new',
    });

    const { snippet } = output.value as { snippet: string };
    expect(snippet).toContain('new');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toHaveLength(EDIT_FILE_SNIPPET_MAX_CHARACTERS + 2);
  });

  test('exposes stable identity and automatic approval', () => {
    expect(createEditFileTool(createFiles('text'))).toMatchObject({
      ref: { source: 'builtin', capabilityId: 'edit_file' },
      providerName: 'edit_file',
      displayName: 'Edit file',
      approval: 'auto',
    });
  });

  test('replaces all non-overlapping exact matches', async () => {
    const files = createFiles('aaaa');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'aa',
      new_string: 'b',
      replace_all: true,
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(expect.objectContaining({ data: 'bb' }));
    expect(output.value).toMatchObject({ status: 'edited', replacements: 2 });
  });

  test('allows deleting the unique match with an empty replacement', async () => {
    const files = createFiles('keep remove keep');
    await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: ' remove',
      new_string: '',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'keep keep' }),
    );
  });

  test('matches case-sensitively', async () => {
    const files = createFiles('Cherry');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'cherry',
      new_string: 'Berry',
    });

    expectError(output, 'not found');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects a repeated single replacement without creating a file', async () => {
    const files = createFiles('same same');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'same',
      new_string: 'new',
    });

    expectError(output, 'multiple');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test.each([
    ['an empty old string', { old_string: '', new_string: 'x' }, 'Invalid input'],
    ['equal strings', { old_string: 'x', new_string: 'x' }, 'must be different'],
    [
      'an invalid id',
      { file_entry_id: 'not-an-id', old_string: 'x', new_string: 'y' },
      'Invalid input',
    ],
  ])('rejects %s', async (_case, overrides, message) => {
    const files = createFiles('x');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      ...overrides,
    });

    expectError(output, message);
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects unavailable managed entries', async () => {
    const files = createFiles('x');
    files.resolveAvailable.mockResolvedValueOnce(new Map());
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'x',
      new_string: 'y',
    });

    expectError(output, 'unavailable');
    expect(files.readAsBytes).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid UTF-8', Uint8Array.from([0xc0, 0xaf]), 'valid UTF-8'],
    ['a NUL byte', Uint8Array.from([65, 0, 66]), 'NUL'],
    ['a binary control', Uint8Array.from([65, 1, 66]), 'control'],
  ])('rejects %s content', async (_case, bytes, message) => {
    const files = createFiles(bytes);
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'A',
      new_string: 'B',
    });

    expectError(output, message);
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('enforces declared and actual source byte limits', async () => {
    const declared = createFiles('x', EDIT_FILE_MAX_CONTENT_BYTES + 1);
    expectError(
      await execute(createEditFileTool(declared), {
        file_entry_id: SOURCE_ID,
        old_string: 'x',
        new_string: 'y',
      }),
      'limit',
    );
    expect(declared.readAsBytes).not.toHaveBeenCalled();

    const actual = createFiles(new Uint8Array(EDIT_FILE_MAX_CONTENT_BYTES + 1), 1);
    expectError(
      await execute(createEditFileTool(actual), {
        file_entry_id: SOURCE_ID,
        old_string: 'x',
        new_string: 'y',
      }),
      'limit',
    );
  });

  test('rejects a result over the byte limit', async () => {
    const files = createFiles('a'.repeat(EDIT_FILE_MAX_CONTENT_BYTES));
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'a',
      new_string: 'aa',
      replace_all: true,
    });

    expectError(output, 'edited file exceeds');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('preserves a UTF-8 BOM and existing newlines', async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a\r\nb\r\n')]);
    const files = createFiles(bytes);
    await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'b',
      new_string: 'c',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ data: '\ufeffa\r\nc\r\n' }),
    );
  });

  test('does not create a copy when cancellation follows the read', async () => {
    const files = createFiles('old');
    const controller = new AbortController();
    files.readAsBytes.mockImplementationOnce(async () => {
      controller.abort(new Error('turn cancelled'));
      return new TextEncoder().encode('old');
    });

    await expect(
      createEditFileTool(files).execute({
        input: {
          file_entry_id: SOURCE_ID,
          old_string: 'old',
          new_string: 'new',
          replace_all: false,
        },
        signal: controller.signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toThrow('turn cancelled');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('lets storage failures surface as execution errors', async () => {
    const files = createFiles('old');
    files.createTextEntry.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      execute(createEditFileTool(files), {
        file_entry_id: SOURCE_ID,
        old_string: 'old',
        new_string: 'new',
      }),
    ).rejects.toThrow('disk full');
  });

  test('exposes a strict portable schema with optional replace_all and no UUID format', () => {
    const schema = createEditFileTool(createFiles('x')).inputSchema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        file_entry_id: expect.objectContaining({ type: 'string' }),
        old_string: expect.objectContaining({ type: 'string' }),
        new_string: expect.objectContaining({ type: 'string' }),
        replace_all: expect.objectContaining({ type: 'boolean' }),
      },
      required: ['file_entry_id', 'old_string', 'new_string'],
      additionalProperties: false,
    });
    expect(schema).not.toMatchObject({
      properties: { file_entry_id: { format: expect.anything() } },
    });
  });
});

function createFiles(content: string | Uint8Array, declaredSize?: number) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const source: ManagedFileFact = {
    fileEntryId: SOURCE_ID,
    mediaType: 'text/markdown',
    name: 'notes.md',
    size: declaredSize ?? bytes.byteLength,
  };
  // A store rather than fixed return values: an edit has to be visible to the
  // next read, which is the whole question for concurrent edits.
  const facts = new Map<string, ManagedFileFact>([[SOURCE_ID, source]]);
  const blobs = new Map<string, Uint8Array>([[SOURCE_ID, bytes]]);
  let nextId = 2;

  const resolveAvailable = jest.fn(async (ids: readonly FileEntryId[]) => {
    const resolved = new Map<string, ManagedFileFact>();
    for (const id of ids) {
      const fact = facts.get(id);
      if (fact) resolved.set(id, fact);
    }
    return resolved;
  });
  const readAsBytes = jest.fn(async (file: ManagedFileFact) => blobs.get(file.fileEntryId));
  const createTextEntry = jest.fn(
    async (input: Parameters<EditFileFiles['createTextEntry']>[0]) => {
      const id = `00000000-0000-7000-8000-00000000000${nextId++}` as FileEntryId;
      const data = new TextEncoder().encode(input.data);
      facts.set(id, {
        fileEntryId: id,
        mediaType: input.mediaType,
        name: input.name,
        size: data.byteLength,
      });
      blobs.set(id, data);
      return FileEntrySchema.parse({
        createdAt: 2,
        filename: input.name,
        id,
        mediaType: input.mediaType,
        provenance: input.provenance,
        size: data.byteLength,
        updatedAt: 2,
      });
    },
  );
  const rewriteTextEntry = jest.fn(
    async (input: Parameters<EditFileFiles['rewriteTextEntry']>[0]) => {
      const fact = facts.get(input.id) ?? source;
      const data = new TextEncoder().encode(input.data);
      blobs.set(input.id, data);
      facts.set(input.id, { ...fact, size: data.byteLength });
      return FileEntrySchema.parse({
        createdAt: 2,
        filename: fact.name,
        id: input.id,
        mediaType: fact.mediaType,
        provenance: 'generated',
        size: data.byteLength,
        updatedAt: 3,
      });
    },
  );
  return {
    createTextEntry,
    readAsBytes,
    resolveAvailable,
    rewriteTextEntry,
  } satisfies EditFileFiles & {
    createTextEntry: jest.Mock;
    readAsBytes: jest.Mock;
    resolveAvailable: jest.Mock;
    rewriteTextEntry: jest.Mock;
  };
}

function execute(
  tool: ReturnType<typeof createEditFileTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}

function expectError(output: RuntimeToolResult, message: string) {
  expect(output).toEqual({
    value: { status: 'error', message: expect.stringContaining(message) },
    artifacts: [],
  });
}
