/** `edit_file`: copy-on-write exact replacement in a managed UTF-8 file. */

import * as z from 'zod';

import type { FileEntry, FileEntryId, FileEntryProvenance } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { ManagedFileFact } from '../resources/managedFileResolver';
import { decodeManagedUtf8, ManagedTextError } from '../resources/managedText';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const EDIT_FILE_TOOL_NAME = 'edit_file';
export const EDIT_FILE_MAX_CONTENT_BYTES = 1_048_576;

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
};

export function createEditFileTool(files: EditFileFiles): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: EDIT_FILE_TOOL_NAME },
    providerName: EDIT_FILE_TOOL_NAME,
    displayName: 'Edit file',
    description:
      'Replace exact text in a Cherry-managed UTF-8 file and save the result as a new file. The source file is never changed. Use file_entry_id from an attachment or earlier file tool result. Use replace_all only when every exact occurrence should change.',
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
          return invalid(managedTextErrorMessage(error.failure));
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

      signal.throwIfAborted();
      const entry = await files.createTextEntry({
        data,
        mediaType: source.mediaType,
        name: source.name,
        provenance: 'generated',
      });

      return {
        value: {
          status: 'edited',
          sourceFileEntryId,
          fileEntryId: entry.id,
          filename: entry.filename,
          size: entry.size,
          replacements: replace_all ? replacements : 1,
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

function managedTextErrorMessage(failure: ManagedTextError['failure']): string {
  switch (failure) {
    case 'binary-content':
      return 'The managed source file contains binary control characters.';
    case 'file-bytes':
      return `The source file exceeds the ${EDIT_FILE_MAX_CONTENT_BYTES}-byte limit.`;
    case 'invalid-utf8':
      return 'The managed source file is not valid UTF-8 text.';
    case 'nul-byte':
      return 'The managed source file contains NUL bytes and appears to be binary.';
  }
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
