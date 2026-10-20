import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
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
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const SOURCE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const EDITED_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const NO_DRAFTS: TurnEditScope = {
  availableFiles: new Map(),
  fileEntryIds: new Set([SOURCE_ID, EDITED_ID]),
  draftFileEntryIds: new Set(),
};
const SOURCE_IS_DRAFT: TurnEditScope = {
  availableFiles: new Map(),
  fileEntryIds: new Set([SOURCE_ID, EDITED_ID]),
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

    expect(files.createTextEntry).toHaveBeenCalledWith(
      {
        data: 'Hello Cherry\n',
        mediaType: 'text/markdown',
        name: 'notes.md',
        baseFileEntryId: SOURCE_ID,
        baseUpdatedAt: undefined,
        provenance: 'generated',
      },
      expect.any(AbortSignal),
    );
    expect(files.rewriteTextEntry).not.toHaveBeenCalled();
    expect(output).toEqual({
      value: {
        status: 'edited',
        sourceFileEntryId: SOURCE_ID,
        fileEntryId: EDITED_ID,
        revision: 2,
        filename: 'notes.md',
        size: 13,
        replacements: 1,
        snippet: 'Hello Cherry\n',
        snippetStartLine: 1,
      },
      artifacts: [
        {
          ref: { kind: 'managed-file', fileEntryId: EDITED_ID },
          mediaType: 'text/markdown',
          name: 'notes.md',
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

    expect(files.rewriteTextEntry).toHaveBeenCalledWith(
      { data: 'Hello Cherry\n', id: SOURCE_ID },
      expect.any(AbortSignal),
    );
    expect(files.createTextEntry).not.toHaveBeenCalled();
    expect(output).toEqual({
      value: {
        status: 'edited',
        sourceFileEntryId: SOURCE_ID,
        fileEntryId: SOURCE_ID,
        revision: 3,
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
    expect(files.rewriteTextEntry).toHaveBeenNthCalledWith(
      1,
      {
        data: 'ALPHA\nbeta\n',
        id: SOURCE_ID,
      },
      expect.any(AbortSignal),
    );
    expect(files.rewriteTextEntry).toHaveBeenNthCalledWith(
      2,
      {
        data: 'ALPHA\nBETA\n',
        id: SOURCE_ID,
      },
      expect.any(AbortSignal),
    );
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
      fileEntryIds: new Set([SOURCE_ID, EDITED_ID]),
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
    expect(files.rewriteTextEntry).toHaveBeenLastCalledWith(
      {
        data: 'ALPHA\nBETA\nGAMMA\n',
        id: EDITED_ID,
      },
      expect.any(AbortSignal),
    );
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
    expect(files.rewriteTextEntry).toHaveBeenCalledWith(
      { data: 'ALPHA\nBETA\n', id: EDITED_ID },
      expect.any(AbortSignal),
    );
    expect(first.artifacts).toHaveLength(1);
    expect(second.artifacts).toHaveLength(0);
    expect(second.value).toMatchObject({ fileEntryId: EDITED_ID, filename: 'notes.md' });
  });

  describe('path edits batched on the base of one read', () => {
    const base = { path: 'notes.md', base_file_entry_id: SOURCE_ID, base_revision: 1 };

    test.each([
      ['a historical file', false],
      ['a draft', true],
    ])('apply in order to %s when they run together', async (_case, draft) => {
      const workspace = createWorkspace('alpha\nbeta\ngamma\n', draft);

      const outputs = await Promise.all([
        execute(workspace.tool, { ...base, old_string: 'alpha', new_string: 'ALPHA' }),
        execute(workspace.tool, { ...base, old_string: 'beta', new_string: 'BETA' }),
        execute(workspace.tool, { ...base, old_string: 'gamma', new_string: 'GAMMA' }),
      ]);

      expect(outputs.map((output) => (output.value as { status: string }).status)).toEqual([
        'edited',
        'edited',
        'edited',
      ]);
      expect(workspace.text()).toBe('ALPHA\nBETA\nGAMMA\n');
    });

    test('apply when the second starts after the first has landed', async () => {
      const workspace = createWorkspace('alpha\nbeta\n', false);

      await execute(workspace.tool, { ...base, old_string: 'alpha', new_string: 'ALPHA' });
      const second = await execute(workspace.tool, {
        ...base,
        old_string: 'beta',
        new_string: 'BETA',
      });

      expect(second.value).toMatchObject({ status: 'edited' });
      expect(workspace.text()).toBe('ALPHA\nBETA\n');
    });

    test('refreshes the base when an earlier edit lands before the path lookup finishes', async () => {
      const workspace = createWorkspace('alpha\nbeta\n', false);
      const writing = deferred();
      const finishWrite = deferred();
      const create = workspace.storage.createTextEntry.getMockImplementation()!;
      workspace.storage.createTextEntry.mockImplementationOnce(async (input) => {
        writing.resolve();
        await finishWrite.promise;
        return create(input);
      });
      const first = execute(workspace.tool, { ...base, old_string: 'alpha', new_string: 'ALPHA' });
      await writing.promise;

      const resolvePath = workspace.library.resolvePath.getMockImplementation()!;
      workspace.library.resolvePath.mockImplementationOnce(async () => {
        await first;
        return resolvePath();
      });
      const second = execute(workspace.tool, { ...base, old_string: 'beta', new_string: 'BETA' });
      const completed = Promise.all([first, second]);
      finishWrite.resolve();

      const outputs = await completed;
      expect(outputs.map((output) => (output.value as { status: string }).status)).toEqual([
        'edited',
        'edited',
      ]);
      expect(workspace.text()).toBe('ALPHA\nBETA\n');
    });

    test.each([
      ['the original path base', base],
      ['the derived draft id', { file_entry_id: EDITED_ID }],
    ])(
      'keeps a late edit using %s behind edits already queued on the source',
      async (_case, ref) => {
        const workspace = createWorkspace('alpha\nbeta\ngamma\n', false);
        const reading = deferred();
        const finishRead = deferred();
        const read = workspace.files.readAsBytes;
        let paused = false;
        jest.spyOn(workspace.files, 'readAsBytes').mockImplementation(async (file, signal) => {
          const bytes = await read(file, signal);
          if (file.fileEntryId === EDITED_ID && !paused) {
            paused = true;
            reading.resolve();
            await finishRead.promise;
          }
          return bytes;
        });
        const first = execute(workspace.tool, {
          ...base,
          old_string: 'alpha',
          new_string: 'ALPHA',
        });
        const second = execute(workspace.tool, { ...base, old_string: 'beta', new_string: 'BETA' });
        await first;
        await reading.promise;

        const third = execute(workspace.tool, { ...ref, old_string: 'gamma', new_string: 'GAMMA' });
        const completed = Promise.all([first, second, third]);
        // Let unblocked lookups and writes settle while the second edit still holds its bytes.
        await new Promise<void>((resolve) => setImmediate(resolve));
        const whileReading = workspace.text();
        finishRead.resolve();

        const outputs = await completed;
        expect(whileReading).toBe('ALPHA\nbeta\ngamma\n');
        expect(outputs.map((output) => (output.value as { status: string }).status)).toEqual([
          'edited',
          'edited',
          'edited',
        ]);
        expect(workspace.text()).toBe('ALPHA\nBETA\nGAMMA\n');
        expect(outputs.flatMap((output) => output.artifacts)).toHaveLength(1);
      },
    );

    test('still conflict when something else changed the file', async () => {
      const workspace = createWorkspace('alpha\nbeta\n', true);

      await execute(workspace.tool, { ...base, old_string: 'alpha', new_string: 'ALPHA' });
      workspace.changeElsewhere('ALPHA\nbeta\ngamma\n');
      const output = await execute(workspace.tool, {
        ...base,
        old_string: 'beta',
        new_string: 'BETA',
      });

      expectError(output, 'stale_revision', 'changed after it was read');
      expect(workspace.text()).toBe('ALPHA\nbeta\ngamma\n');
    });
  });

  test('preserves the source name even when another session file shares it', async () => {
    const files = createFiles('Hello world\n');
    const scope: TurnEditScope = {
      availableFiles: new Map([
        [
          EDITED_ID,
          { fileEntryId: EDITED_ID, mediaType: 'text/markdown', name: 'notes.md', size: 1 },
        ],
      ]),
      fileEntryIds: new Set([SOURCE_ID, EDITED_ID]),
      draftFileEntryIds: new Set(),
    };
    await execute(createEditFileTool(files, scope), {
      file_entry_id: SOURCE_ID,
      old_string: 'world',
      new_string: 'Cherry',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notes.md' }),
      expect.any(AbortSignal),
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

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'bb' }),
      expect.any(AbortSignal),
    );
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
      expect.any(AbortSignal),
    );
  });

  test('matches case-sensitively', async () => {
    const files = createFiles('Cherry');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'cherry',
      new_string: 'Berry',
    });

    expectError(output, 'old_string_not_found', 'not found');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects a repeated single replacement without creating a file', async () => {
    const files = createFiles('same same');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'same',
      new_string: 'new',
    });

    expectError(output, 'old_string_ambiguous', 'multiple');
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

    expectError(output, 'invalid_tool_input', message);
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

    expectError(output, 'file_unavailable', 'unavailable');
    expect(files.readAsBytes).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid UTF-8', Uint8Array.from([0xc0, 0xaf]), 'valid UTF-8'],
    ['a NUL byte', Uint8Array.from([65, 0, 66]), 'NUL'],
  ])('rejects %s content', async (_case, bytes, message) => {
    const files = createFiles(bytes);
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'A',
      new_string: 'B',
    });

    expectError(output, 'not_text', message);
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
      'file_too_large',
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
      'file_too_large',
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

    expectError(output, 'file_too_large', 'edited file exceeds');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('refuses an oversized replace_all before building the result', async () => {
    // Joined, this would be a 10-billion-character string: over the engine's
    // string limit, so building it first throws instead of returning an error.
    const files = createFiles('a'.repeat(EDIT_FILE_MAX_CONTENT_BYTES));
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'a',
      new_string: 'x'.repeat(10_000),
      replace_all: true,
    });

    expectError(output, 'file_too_large', 'edited file exceeds');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('measures the result limit in bytes, not characters', async () => {
    // Under the limit by length, three times over it in UTF-8.
    const files = createFiles('a'.repeat(EDIT_FILE_MAX_CONTENT_BYTES / 2));
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'a',
      new_string: '中',
      replace_all: true,
    });

    expectError(output, 'file_too_large', 'edited file exceeds');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('refuses NUL in the replacement, which read_file would reject as binary', async () => {
    const files = createFiles('hello');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'hello',
      new_string: 'he\u0000llo',
    });

    expectError(output, 'invalid_tool_input', 'NUL');
    expect(files.readAsBytes).not.toHaveBeenCalled();
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
      expect.any(AbortSignal),
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
        turnId: 'turn-1',
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
        path: expect.objectContaining({ type: 'string' }),
        base_file_entry_id: expect.objectContaining({ type: 'string' }),
        base_revision: expect.objectContaining({ type: 'integer' }),
      },
      required: ['old_string', 'new_string'],
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

/** One workspace file whose current version and revision advance with every write. */
function createWorkspace(initial: string, draft: boolean) {
  const blobs = new Map<string, string>([[SOURCE_ID, initial]]);
  const revisions = new Map<string, number>([[SOURCE_ID, 1]]);
  let current: FileEntryId = SOURCE_ID;
  let nextId = 2;
  let clock = 1;
  const entry = (id: FileEntryId) =>
    FileEntrySchema.parse({
      createdAt: 1,
      filename: 'notes.md',
      id,
      mediaType: 'text/markdown',
      provenance: 'generated',
      size: new TextEncoder().encode(blobs.get(id)).byteLength,
      updatedAt: revisions.get(id),
    });
  const store = (id: FileEntryId, data: string) => {
    blobs.set(id, data);
    revisions.set(id, ++clock);
    return entry(id);
  };
  const files: EditFileFiles = {
    createTextEntry: jest.fn(),
    rewriteTextEntry: jest.fn(),
    readAsBytes: async (file) => new TextEncoder().encode(blobs.get(file.fileEntryId)),
    resolveAvailable: async (ids) =>
      new Map(
        ids
          .filter((id) => blobs.has(id))
          .map((id) => [
            id,
            {
              fileEntryId: id,
              mediaType: 'text/markdown',
              name: 'notes.md',
              size: new TextEncoder().encode(blobs.get(id)).byteLength,
              revision: revisions.get(id),
            },
          ]),
      ),
  };
  const library = {
    contains: async () => true,
    fileForEntry: async () => ({ id: 'file-1', name: 'notes.md', folderId: 'folder-1' }),
    resolvePath: jest.fn(async () => ({ file: { currentEntryId: current, name: 'notes.md' } })),
  };
  const storage = {
    createTextEntry: jest.fn(async (input: { data: string }) => {
      current = `00000000-0000-7000-8000-00000000000${nextId++}` as FileEntryId;
      return store(current, input.data);
    }),
    rewriteTextEntry: jest.fn(
      async (input: { data: string; id: FileEntryId; baseUpdatedAt?: number }) => {
        if (input.id !== current || input.baseUpdatedAt !== revisions.get(input.id))
          throw DataApiErrorFactory.conflict('The draft changed after it was read.');
        return store(input.id, input.data);
      },
    ),
  };
  const fileEntryIds = new Set<string>();
  const draftFileEntryIds = new Set<string>(draft ? [SOURCE_ID] : []);
  const scope: TurnEditScope = {
    availableFiles: new Map(),
    fileEntryIds,
    draftFileEntryIds,
  };
  const grantFile = (id: FileEntryId) => {
    fileEntryIds.add(id);
    draftFileEntryIds.add(id);
  };
  const access = new WorkspaceFileAccess(
    'folder-1',
    { ...scope, grantFile },
    library as unknown as FileLibraryService,
    storage as unknown as ConstructorParameters<typeof WorkspaceFileAccess>[3],
  );
  const tool = createTool(files, scope, access);
  return {
    tool: {
      ...tool,
      async execute(call: Parameters<typeof tool.execute>[0]) {
        const output = await tool.execute(call);
        for (const artifact of output.artifacts) grantFile(artifact.ref.fileEntryId);
        return output;
      },
    },
    files,
    library,
    storage,
    text: () => blobs.get(current),
    changeElsewhere: (data: string) => store(current, data),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function execute(
  tool: ReturnType<typeof createEditFileTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({
    input,
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    turnId: 'turn-1',
  });
}

function expectError(output: RuntimeToolResult, code: string, message: string) {
  expect(output).toEqual({
    value: { status: 'error', code, message: expect.stringContaining(message) },
    artifacts: [],
  });
}
