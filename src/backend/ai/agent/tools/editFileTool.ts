/**
 * `edit_file`: exact replacement in a managed UTF-8 file.
 *
 * Where the result lands depends on who produced the source. A file this turn
 * created is the turn's draft and is rewritten in place, so a turn ends with
 * one artifact however many edits it took. Any other file is history: the edit
 * saves a new version at the same logical path and the source is never
 * changed (docs/references/agent/agent-tools-and-resources.md).
 */

import * as z from 'zod';

import {
  codePointStart,
  decodeManagedUtf8,
  describeManagedTextFailure,
  ManagedTextError,
  takeCodePoints,
} from '@/backend/services/file/utf8Text';
import type { FileEntry, FileEntryId, FileEntryProvenance } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import type { FilePlacement } from '@/shared/data/types/fileLibrary';

import type { ManagedFileFact, TurnResourceLedger } from '../resources/managedFileResolver';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export const EDIT_FILE_TOOL_NAME = 'edit_file';
export const EDIT_FILE_MAX_CONTENT_BYTES = 1_048_576;
/** Enough to show the change with context; never a second copy of the file. */
export const EDIT_FILE_SNIPPET_MAX_CHARACTERS = 1_200;
const SNIPPET_CONTEXT_LINES = 2;

export const editFileInputSchema = z.strictObject({
  // Keep provider JSON Schema free of `format: uuid`; some strict
  // OpenAI-compatible providers reject that keyword before any tool runs.
  file_entry_id: z
    .string()
    .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.')
    .describe('Managed version id from an attachment or an earlier file tool result.')
    .optional(),
  path: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe('Relative workspace path, instead of file_entry_id.'),
  base_file_entry_id: z
    .string()
    .optional()
    .describe(
      'Required with path: the version id returned by the last read. A newer version causes a conflict.',
    ),
  base_revision: z
    .int()
    .nonnegative()
    .optional()
    .describe('Required with path: the revision returned by read_file.'),
  old_string: z.string().min(1).describe('Exact, case-sensitive text to replace.'),
  new_string: z.string().describe('Replacement text. Use an empty string to delete the match.'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace every non-overlapping exact match. Defaults to false.'),
});

export type EditFileFiles = {
  createTextEntry(
    input: FilePlacement & {
      data: string;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    },
    signal: AbortSignal,
  ): Promise<FileEntry>;
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  resolveAvailable(ids: readonly FileEntryId[]): Promise<ReadonlyMap<string, ManagedFileFact>>;
  rewriteTextEntry(
    input: { data: string; id: FileEntryId },
    signal: AbortSignal,
  ): Promise<FileEntry>;
};

/**
 * The slice of the turn ledger this tool consults: which entries are its drafts,
 * and which conversation files may be read.
 */
export type TurnEditScope = Pick<
  TurnResourceLedger,
  'availableFiles' | 'draftFileEntryIds' | 'fileEntryIds'
>;

type FileEditQueue = { tail: Promise<unknown>; draftId?: FileEntryId };

export function createEditFileTool(
  files: EditFileFiles,
  scope: TurnEditScope,
  access?: WorkspaceFileAccess,
): RuntimeTool {
  /**
   * A source and the draft derived from it share one queue. Register calls before
   * resolving their paths, so asynchronous lookups cannot reorder a batch.
   */
  const queues = new Map<string, FileEditQueue>();
  /**
   * The version and revision each of this tool's writes replaced, mapped to what it
   * wrote. Edits batched in one message all carry the base of the same read; a base
   * this turn's own queued edit replaced continues from that edit's result. Any
   * other change keeps the base stale and conflicts.
   */
  const written = new Map<string, FileBase>();
  const latestBase = (base: FileBase): FileBase => {
    // Revisions only advance, so the chain ends.
    let next = written.get(baseKey(base));
    while (next) {
      base = next;
      next = written.get(baseKey(base));
    }
    return base;
  };
  const recordWrite = (source: ManagedFileFact, entry: FileEntry) => {
    if (source.revision !== undefined)
      written.set(baseKey({ fileEntryId: source.fileEntryId, revision: source.revision }), {
        fileEntryId: entry.id,
        revision: entry.updatedAt,
      });
  };

  const edit = async (
    queue: FileEditQueue,
    requestedId: FileEntryId,
    old_string: string,
    new_string: string,
    replace_all: boolean,
    signal: AbortSignal,
    expected?: FileBase,
  ): Promise<RuntimeToolResult> => {
    // A version this turn already derived is one of its drafts, whether or not
    // the catalog wrapper has granted it yet: parallel calls can reach here
    // before that grant lands.
    const derived = queue.draftId;
    const sourceFileEntryId = derived ?? requestedId;
    const rewritable = derived !== undefined || scope.draftFileEntryIds.has(sourceFileEntryId);

    signal.throwIfAborted();
    const source = (await files.resolveAvailable([sourceFileEntryId])).get(sourceFileEntryId);
    if (!source) {
      return invalid('file_unavailable', 'The managed source file is unavailable.');
    }
    if (expected) {
      const base = latestBase(expected);
      if (base.fileEntryId !== sourceFileEntryId || base.revision !== source.revision)
        return invalid(
          'stale_revision',
          'The draft changed after it was read. Read the file again.',
        );
    }
    if (source.size > EDIT_FILE_MAX_CONTENT_BYTES) {
      return invalid(
        'file_too_large',
        `The source file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`,
      );
    }

    let bytes: Uint8Array | undefined;
    try {
      bytes = await files.readAsBytes(source, signal);
    } catch {
      signal.throwIfAborted();
      return invalid('file_unreadable', 'The managed source file could not be read.');
    }
    signal.throwIfAborted();
    if (!bytes) {
      return invalid('file_unavailable', 'The managed source file is unavailable.');
    }

    let decoded: ReturnType<typeof decodeManagedUtf8>;
    try {
      decoded = decodeManagedUtf8(bytes, EDIT_FILE_MAX_CONTENT_BYTES);
    } catch (error) {
      if (error instanceof ManagedTextError) {
        return invalid(
          error.failure === 'file-bytes' ? 'file_too_large' : 'not_text',
          describeManagedTextFailure(error.failure, EDIT_FILE_MAX_CONTENT_BYTES),
        );
      }
      throw error;
    }

    const replacements = countOccurrences(decoded.text, old_string);
    if (replacements === 0) {
      return invalid('old_string_not_found', 'old_string was not found in the source file.');
    }
    if (!replace_all && replacements !== 1) {
      return invalid(
        'old_string_ambiguous',
        'old_string appears multiple times. Include more surrounding text or set replace_all to true.',
      );
    }

    const replacementCount = replace_all ? replacements : 1;
    // UTF-8 never takes fewer bytes than a string has UTF-16 units, so this lower
    // bound refuses an oversized result before building it: replace_all of a
    // one-character match in a 1 MiB file could otherwise allocate gigabytes.
    if (
      decoded.text.length + replacementCount * (new_string.length - old_string.length) >
      EDIT_FILE_MAX_CONTENT_BYTES
    ) {
      return invalid(
        'file_too_large',
        `The edited file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`,
      );
    }

    const editedText = replace_all
      ? decoded.text.split(old_string).join(new_string)
      : replaceSingle(decoded.text, old_string, new_string);
    const data = decoded.hasBom ? `\ufeff${editedText}` : editedText;
    const size = new TextEncoder().encode(data).byteLength;
    if (size > EDIT_FILE_MAX_CONTENT_BYTES) {
      return invalid(
        'file_too_large',
        `The edited file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`,
      );
    }

    const snippet = changeSnippet(editedText, decoded.text.indexOf(old_string), new_string.length);

    signal.throwIfAborted();
    if (rewritable) {
      const entry = await (access
        ? access.rewrite({ data, id: sourceFileEntryId, baseUpdatedAt: source.revision }, signal)
        : files.rewriteTextEntry({ data, id: sourceFileEntryId }, signal));
      recordWrite(source, entry);
      return {
        value: {
          status: 'edited',
          sourceFileEntryId,
          fileEntryId: entry.id,
          revision: entry.updatedAt,
          filename: entry.filename,
          size: entry.size,
          replacements: replacementCount,
          ...snippet,
        },
        // The draft's artifact part already exists; a second one would show
        // the same file twice.
        artifacts: [],
      };
    }

    const entry = access
      ? await access.createVersion(
          sourceFileEntryId,
          { data, mediaType: source.mediaType, name: source.name, baseUpdatedAt: source.revision },
          signal,
        )
      : await files.createTextEntry(
          {
            data,
            mediaType: source.mediaType,
            name: source.name,
            baseFileEntryId: sourceFileEntryId,
            baseUpdatedAt: source.revision,
            provenance: 'generated',
          },
          signal,
        );
    queue.draftId = entry.id;
    queues.set(entry.id, queue);
    recordWrite(source, entry);

    return {
      value: {
        status: 'edited',
        sourceFileEntryId,
        fileEntryId: entry.id,
        revision: entry.updatedAt,
        filename: entry.filename,
        size: entry.size,
        replacements: replacementCount,
        ...snippet,
      },
      artifacts: [
        {
          ref: { kind: 'managed-file', fileEntryId: entry.id },
          mediaType: entry.mediaType,
          name: entry.filename,
          kind: 'derived',
        },
      ],
    };
  };

  return {
    ref: { source: 'builtin', capabilityId: EDIT_FILE_TOOL_NAME },
    providerName: EDIT_FILE_TOOL_NAME,
    displayName: 'Edit file',
    description:
      'Replace exact text in a Cherry-managed UTF-8 file. Use file_entry_id from an attachment or an earlier file tool result. A file created earlier in this same turn is updated in place and keeps its id; any other file is preserved as an immutable historical version. Editing a workspace file advances its stable path; editing an approved outside source saves a new workspace copy. A path edit requires base_file_entry_id and base_revision from the last read. Several edits of one file may be sent together with the same base; they apply in order. A conflict requires re-reading. Use replace_all only when every exact occurrence should change. The result includes a snippet of the edited region and the one-based line it starts at, usable as read_file start_line.',
    inputSchema: toRuntimeInputSchema(editFileInputSchema),
    inputPreview: { textField: 'new_string' },
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = editFileInputSchema.safeParse(input);
      if (!parsed.success) {
        return Promise.resolve(
          invalid('invalid_tool_input', `Invalid input: ${z.prettifyError(parsed.error)}`),
        );
      }
      const {
        base_file_entry_id,
        base_revision,
        file_entry_id,
        new_string,
        old_string,
        replace_all = false,
      } = parsed.data;
      if (!access && (!file_entry_id || parsed.data.path))
        return invalid('invalid_tool_input', 'Provide a managed file_entry_id.');
      if (old_string === new_string) {
        return Promise.resolve(
          invalid('invalid_tool_input', 'old_string and new_string must be different.'),
        );
      }
      // read_file refuses NUL as binary; writing it would leave a file nothing can read back.
      if (new_string.includes('\0')) {
        return Promise.resolve(
          invalid(
            'invalid_tool_input',
            'new_string contains NUL characters. Remove them; a text file cannot hold NUL.',
          ),
        );
      }
      // Valid references carry an entry id, even in path mode. Missing ids fail
      // reference validation inside the queue without touching a file.
      const key = file_entry_id ?? base_file_entry_id ?? '';
      const queue = queues.get(key) ?? { tail: Promise.resolve() };
      queues.set(key, queue);
      return runExclusively(queue, async () => {
        signal.throwIfAborted();
        const base =
          base_file_entry_id !== undefined && base_revision !== undefined
            ? latestBase({ fileEntryId: base_file_entry_id, revision: base_revision })
            : undefined;
        const requestedId = access
          ? await access.resolveEdit(
              base
                ? {
                    ...parsed.data,
                    base_file_entry_id: base.fileEntryId,
                    base_revision: base.revision,
                  }
                : parsed.data,
            )
          : FileEntryIdSchema.parse(file_entry_id);
        if (!access && !scope.fileEntryIds.has(requestedId))
          return invalid('file_not_in_scope', 'The file is not part of this conversation.');
        const expected =
          base_revision === undefined
            ? undefined
            : { fileEntryId: base_file_entry_id ?? requestedId, revision: base_revision };
        return edit(queue, requestedId, old_string, new_string, replace_all, signal, expected);
      });
    },
  };
}

/**
 * Serializes work that shares a key. A message's tool calls run in parallel, so
 * two edits of one file would both read the pre-edit bytes and the second write
 * would drop the first edit — the copy-on-write model tolerated that, an
 * in-place draft rewrite cannot. Queueing happens synchronously at call time,
 * so the edits also apply in the order the model listed them.
 */
function runExclusively<T>(queue: FileEditQueue, work: () => Promise<T>): Promise<T> {
  const result = queue.tail.then(work);
  // The queued tail never rejects: one failed edit must not fail the next.
  queue.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * The edited region with a couple of lines of context on each side. When that
 * window is over budget the cut keeps the change and spends what is left on the
 * text around it: on a file whose lines are long (minified HTML, one paragraph
 * per line) a snippet cut from the start of the window can end before the change
 * and confirm nothing.
 */
function changeSnippet(
  text: string,
  changeStart: number,
  changeLength: number,
): { snippet: string; snippetStartLine: number } {
  const contextStart = snippetStart(text, changeStart);
  const contextEnd = snippetEnd(text, changeStart + changeLength);
  const slack = Math.max(EDIT_FILE_SNIPPET_MAX_CHARACTERS - changeLength, 0);
  const start = codePointStart(
    text,
    contextEnd - contextStart > EDIT_FILE_SNIPPET_MAX_CHARACTERS
      ? changeStart - Math.min(changeStart - contextStart, Math.ceil(slack / 2))
      : contextStart,
  );
  const body = takeCodePoints(text.slice(start, contextEnd), EDIT_FILE_SNIPPET_MAX_CHARACTERS);
  return {
    snippet: `${start > contextStart ? '…' : ''}${body.value}${body.didTruncate ? '…' : ''}`,
    snippetStartLine: countLines(text.slice(0, start)) + 1,
  };
}

/** Start of the line holding `position`, moved back by the context lines. */
function snippetStart(text: string, position: number): number {
  let start = position;
  for (let lines = 0; lines <= SNIPPET_CONTEXT_LINES; lines += 1) {
    if (start <= 0) return 0;
    const newline = text.lastIndexOf('\n', start - 1);
    if (newline === -1) return 0;
    start = newline;
  }
  return start + 1;
}

/** End of the line holding `position`, moved forward by the context lines. */
function snippetEnd(text: string, position: number): number {
  let end = position;
  for (let lines = 0; lines <= SNIPPET_CONTEXT_LINES; lines += 1) {
    const newline = text.indexOf('\n', end);
    if (newline === -1) return text.length;
    end = newline + 1;
  }
  return end;
}

function countLines(text: string): number {
  let count = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    count += 1;
  }
  return count;
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= content.length - search.length) {
    const index = content.indexOf(search, offset);
    if (index === -1) break;
    count += 1;
    offset = index + search.length;
  }
  return count;
}

function replaceSingle(content: string, search: string, replacement: string): string {
  const index = content.indexOf(search);
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

type FileBase = { fileEntryId: string; revision: number };

function baseKey({ fileEntryId, revision }: FileBase): string {
  return `${fileEntryId}@${revision}`;
}

/** The code is the diagnostic cause; the message is what the model reads. */
function invalid(code: string, message: string): RuntimeToolResult {
  return { value: { status: 'error', code, message }, artifacts: [] };
}
