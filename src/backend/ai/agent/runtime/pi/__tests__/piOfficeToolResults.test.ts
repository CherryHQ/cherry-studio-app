import { runInNewContext } from 'node:vm';

import type { TSchema } from '@earendil-works/pi-ai';
import { validateToolArguments } from '@earendil-works/pi-ai/utils/validation';
import { renderToolSignature } from '@earendil-works/pi-codemode/declarations';

import { fileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { JsSandbox } from '@/backend/services/jsSandbox';
import { FileEntryIdSchema, FileEntrySchema, type FileEntry } from '@/shared/data/types/file';

import { managedFileResolver } from '../../../resources/managedFileResolver';
import { createFileLibraryTools } from '../../../tools/fileLibraryTools';
import type { OfficeFiles } from '../../../tools/officeToolResources';
import { createOfficeTools } from '../../../tools/officeTools';
import { WorkspaceFileAccess } from '../../../tools/workspaceFileAccess';
import type { RuntimeJsonValue } from '../../types';

function setup() {
  const entries = new Map<string, { entry: FileEntry; data: Uint8Array }>();
  const files: OfficeFiles = {
    async createBytesEntry(input) {
      const entry = FileEntrySchema.parse({
        id: `00000000-0000-7000-8000-${String(entries.size + 1).padStart(12, '0')}`,
        filename: input.name,
        mediaType: input.mediaType,
        size: input.data.length,
        provenance: 'generated',
        createdAt: 1,
        updatedAt: 1,
      });
      entries.set(entry.id, { entry, data: input.data });
      return entry;
    },
    async readAsBytes(file) {
      return entries.get(file.fileEntryId)!.data;
    },
    async resolveAvailable(ids) {
      return new Map(
        ids.map((id) => {
          const { entry } = entries.get(id)!;
          return [id, { fileEntryId: id, name: entry.filename, ...entry }];
        }),
      );
    },
  };
  // Execute the production job text; native QuickJS limits remain device acceptance concerns.
  const sandbox: JsSandbox = {
    async run({ code, onSettled }) {
      try {
        const result: unknown = await runInNewContext(`(async () => { ${code} })()`, {
          queueMicrotask,
          atob,
          btoa,
        });
        return {
          status: 'ok',
          result: JSON.stringify(result),
          logs: '',
          logsTruncated: false,
          durationMs: 1,
        };
      } finally {
        onSettled?.();
      }
    },
  };
  const tools = createOfficeTools(sandbox, files, {
    folderId: null,
    resolveRead: async ({ file_entry_id }) => FileEntryIdSchema.parse(file_entry_id),
  });
  async function execute(name: string, input: RuntimeJsonValue) {
    const tool = tools.find((candidate) => candidate.providerName === name)!;
    const result = await tool.execute({
      input,
      signal: new AbortController().signal,
      turnId: 'turn',
      toolCallId: 'call',
    });
    expect(tool.outputSchema).toBeDefined();
    const value = result.value as Record<string, RuntimeJsonValue>;
    // Use the same JSON Schema validator consumed by Pi, against actual tool results.
    validateToolArguments(
      { name, description: '', parameters: tool.outputSchema as TSchema },
      { type: 'toolCall', id: 'result', name, arguments: value },
    );
    return value;
  }
  return { tools, execute };
}

test.each([
  {
    format: 'docx',
    create: 'create_document',
    edit: 'edit_document',
    spec: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] },
  },
  {
    format: 'xlsx',
    create: 'create_workbook',
    edit: 'edit_workbook',
    spec: { version: 1, sheets: [{ name: 'Data', rows: [['Hello', 1, true, null]] }] },
  },
  {
    format: 'pptx',
    create: 'create_presentation',
    edit: 'edit_presentation',
    spec: { version: 1, slides: [{ type: 'title', title: 'Hello', subtitle: 'World' }] },
  },
])(
  '$format outputs match the declared create/inspect/read/edit/error contracts',
  async (fixture) => {
    const { execute } = setup();
    const created = await execute(fixture.create, {
      filename: `source.${fixture.format}`,
      spec: fixture.spec as RuntimeJsonValue,
    });
    expect(created.status).toBe('created');
    const source = { file_entry_id: created.fileEntryId };
    const inspected = await execute('inspect_office_file', source);
    expect(inspected.status).toBe('read');
    const items = inspected.items as Record<string, RuntimeJsonValue>[];
    const shapes = items[0].shapes as Record<string, RuntimeJsonValue>[] | undefined;
    const anchor: RuntimeJsonValue =
      fixture.format === 'docx'
        ? { ...(items[0].anchor as object), charRange: [0, 5] }
        : fixture.format === 'xlsx'
          ? { format: 'xlsx', sheet: 'Data', range: 'A1:D1' }
          : { format: 'pptx', slide: 1, nodeId: shapes![0].nodeId, paragraph: 0 };
    const content = await execute('read_office_content', { ...source, anchor });
    expect(content.status).toBe('read');
    const edit: Record<string, RuntimeJsonValue> = {
      ...source,
      version: 1,
      source_sha256: content.source_sha256,
      filename: `copy.${fixture.format}`,
      ...(fixture.format === 'xlsx'
        ? { sheet: 'Data', cells: [{ address: 'A1', value: 'Updated' }] }
        : { edits: [{ anchor, expect_text: content.text, find: 'Hello', replace: 'Updated' }] }),
    };
    expect((await execute(fixture.edit, { ...edit, source_sha256: '0'.repeat(64) })).status).toBe(
      'error',
    );
    const edited = await execute(fixture.edit, edit);
    expect(edited.status).toBe('created');
    expect(edited.fileEntryId).not.toBe(created.fileEntryId);
    const reread = await execute('read_office_content', {
      file_entry_id: edited.fileEntryId,
      anchor,
    });
    if (fixture.format === 'xlsx')
      expect(reread.rows).toMatchObject([
        [{ value: 'Updated' }, { value: 1 }, { value: true }, { value: null }],
      ]);
    else expect(reread.text).toBe('Updated');
  },
);

test('Code Mode declarations expose the fields that callers previously had to guess', () => {
  const { tools } = setup();
  const signature = (name: string) => {
    const tool = tools.find((candidate) => candidate.providerName === name)!;
    return renderToolSignature({
      name,
      inputSchema: tool.inputSchema as TSchema,
      outputSchema: tool.outputSchema as TSchema,
    });
  };
  expect(signature('create_document')).toContain('status: "created"');
  expect(signature('create_document')).toContain('fileEntryId: string');
  expect(signature('create_document')).toContain('status: "error"');
  expect(signature('inspect_office_file')).toContain('excerpt: string');
  expect(signature('inspect_office_file')).toContain('anchor:');
  expect(signature('read_office_content')).toContain('rows: Array<Array<');
  expect(signature('read_office_content')).toContain('status: "read"');
});

afterEach(() => jest.restoreAllMocks());

test('declares the file search result as a paged files object without a status', async () => {
  const entry = FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'notes.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 10,
    provenance: 'generated',
    createdAt: 1,
    updatedAt: 2,
  });
  jest.spyOn(fileLibraryService, 'list').mockResolvedValue({
    items: [{ id: 'logical-file', folderId: null, name: entry.filename, entry, versionCount: 1 }],
  });
  const access = new WorkspaceFileAccess(
    null,
    {
      fileEntryIds: new Set(),
      availableFiles: new Map(),
      draftFileEntryIds: new Set(),
      grantFile() {},
    },
    fileLibraryService,
  );
  const tools = createFileLibraryTools(access, managedFileResolver, 'builtin');
  const tool = tools.find((candidate) => candidate.providerName === 'library_search_files')!;
  const result = await tool.execute({
    input: { query: 'notes' },
    signal: new AbortController().signal,
    turnId: 'turn',
    toolCallId: 'call',
  });
  expect(result.value).toEqual({
    files: [
      {
        fileId: 'logical-file',
        folderId: null,
        fileEntryId: entry.id,
        revision: 2,
        name: entry.filename,
        mediaType: entry.mediaType,
        size: 10,
      },
    ],
    nextCursor: null,
  });
  validateToolArguments(
    { name: tool.providerName, description: '', parameters: tool.outputSchema as TSchema },
    {
      type: 'toolCall',
      id: 'result',
      name: tool.providerName,
      arguments: result.value as Record<string, RuntimeJsonValue>,
    },
  );
  const declaration = renderToolSignature({
    name: tool.providerName,
    inputSchema: tool.inputSchema as TSchema,
    outputSchema: tool.outputSchema as TSchema,
  });
  expect(declaration).toContain('files: Array<');
  expect(declaration).toContain('fileEntryId: string');
  expect(declaration).not.toContain('status:');
});
