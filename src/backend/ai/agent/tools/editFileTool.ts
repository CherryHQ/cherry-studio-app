/**
 * `edit_file`: exact replacement in a managed UTF-8 file.
 *
 * Where the result lands depends on who produced the source. A file this turn
 * created is the turn's draft and is rewritten in place, so a turn ends with
 * one artifact however many edits it took. Any other file is history: the edit
 * saves a new version (`report.html` → `report v2.html`) and the source is never
 * changed (docs/references/agent/agent-tools-and-resources.md).
 */

import * as z from 'zod';

import type { FileEntry, FileEntryId, FileEntryProvenance } from '@/shared/data/types/file';
import { FileEntryIdSchema, nextVersionFilename } from '@/shared/data/types/file';

import type { ManagedFileFact, TurnResourceLedger } from '../resources/managedFileResolver';
import {
  decodeManagedUtf8,
  describeManagedTextFailure,
  ManagedTextError,
} from '../resources/managedText';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

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
    .describe('Managed file id from an attachment or an earlier file tool result.'),
  old_string: z.string().min(1).describe('Exact, case-sensitive text to replace.'),
  new_string: z.string().describe('Replacement text. Use an empty string to delete the match.'),
  replace_all: z
    .boolean()
    .optional()
    .describe('Replace every non-overlapping exact match. Defaults to false.'),
});

export type EditFileFiles = {
  createTextEntry(input: {
    data: string;
    mediaType: string;
    name: string;
    provenance: FileEntryProvenance;
  }): Promise<FileEntry>;
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  resolveAvailable(ids: readonly FileEntryId[]): Promise<ReadonlyMap<string, ManagedFileFact>>;
  rewriteTextEntry(input: { data: string; id: FileEntryId }): Promise<FileEntry>;
};

/** The slice of the turn ledger this tool consults: which entries are its drafts. */
export type TurnDraftScope = Pick<TurnResourceLedger, 'draftFileEntryIds'>;

export function createEditFileTool(files: EditFileFiles, drafts: TurnDraftScope): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: EDIT_FILE_TOOL_NAME },
    providerName: EDIT_FILE_TOOL_NAME,
    displayName: 'Edit file',
    description:
      'Replace exact text in a Cherry-managed UTF-8 file. Use file_entry_id from an attachment or an earlier file tool result. A file created earlier in this same turn is updated in place and keeps its id; any other file is left unchanged and the edit is saved as a new version (`report.html` becomes `report v2.html`). Use replace_all only when every exact occurrence should change. The result includes a snippet of the edited region.',
    inputSchema: toRuntimeInputSchema(editFileInputSchema),
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = editFileInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      }
      const { file_entry_id, new_string, old_string, replace_all = false } = parsed.data;
      const sourceFileEntryId = FileEntryIdSchema.parse(file_entry_id);
      if (old_string === new_string) {
        return invalid('old_string and new_string must be different.');
      }

      signal.throwIfAborted();
      const source = (await files.resolveAvailable([sourceFileEntryId])).get(sourceFileEntryId);
      if (!source) {
        return invalid('The managed source file is unavailable.');
      }
      if (source.size > EDIT_FILE_MAX_CONTENT_BYTES) {
        return invalid(`The source file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`);
      }

      let bytes: Uint8Array | undefined;
      try {
        bytes = await files.readAsBytes(source, signal);
      } catch {
        signal.throwIfAborted();
        return invalid('The managed source file could not be read.');
      }
      signal.throwIfAborted();
      if (!bytes) {
        return invalid('The managed source file is unavailable.');
      }

      let decoded: ReturnType<typeof decodeManagedUtf8>;
      try {
        decoded = decodeManagedUtf8(bytes, EDIT_FILE_MAX_CONTENT_BYTES);
      } catch (error) {
        if (error instanceof ManagedTextError) {
          return invalid(describeManagedTextFailure(error.failure, EDIT_FILE_MAX_CONTENT_BYTES));
        }
        throw error;
      }

      const replacements = countOccurrences(decoded.text, old_string);
      if (replacements === 0) {
        return invalid('old_string was not found in the source file.');
      }
      if (!replace_all && replacements !== 1) {
        return invalid(
          'old_string appears multiple times. Include more surrounding text or set replace_all to true.',
        );
      }

      const editedText = replace_all
        ? decoded.text.split(old_string).join(new_string)
        : replaceSingle(decoded.text, old_string, new_string);
      const data = decoded.hasBom ? `\ufeff${editedText}` : editedText;
      const size = new TextEncoder().encode(data).byteLength;
      if (size > EDIT_FILE_MAX_CONTENT_BYTES) {
        return invalid(`The edited file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`);
      }

      const snippet = changeSnippet(
        editedText,
        decoded.text.indexOf(old_string),
        new_string.length,
      );
      const replacementCount = replace_all ? replacements : 1;

      signal.throwIfAborted();
      if (drafts.draftFileEntryIds.has(sourceFileEntryId)) {
        const entry = await files.rewriteTextEntry({ data, id: sourceFileEntryId });
        return {
          value: {
            status: 'edited',
            sourceFileEntryId,
            fileEntryId: entry.id,
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

      const entry = await files.createTextEntry({
        data,
        mediaType: source.mediaType,
        name: nextVersionFilename(source.name),
        provenance: 'generated',
      });

      return {
        value: {
          status: 'edited',
          sourceFileEntryId,
          fileEntryId: entry.id,
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
    },
  };
}

/**
 * The edited region with a couple of lines of context on each side, so the
 * model can confirm the change without reading the file back.
 */
function changeSnippet(
  text: string,
  changeStart: number,
  changeLength: number,
): { snippet: string; snippetStartLine: number } {
  const start = snippetStart(text, changeStart);
  const end = snippetEnd(text, changeStart + changeLength);
  const snippetStartLine = countLines(text.slice(0, start)) + 1;
  const full = text.slice(start, end);
  const snippet =
    full.length > EDIT_FILE_SNIPPET_MAX_CHARACTERS
      ? `${full.slice(0, EDIT_FILE_SNIPPET_MAX_CHARACTERS)}…`
      : full;
  return { snippet, snippetStartLine };
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

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
