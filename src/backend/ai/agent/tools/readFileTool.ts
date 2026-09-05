/**
 * `read_file`: the model reads a managed UTF-8 file it already holds a
 * reference to.
 *
 * Reads expose content, so unlike `edit_file` this tool is ledger-scoped: only
 * an entry attached to the Session, produced by an earlier turn, or created in
 * this turn can be read. Output is a bounded line window so a large file is
 * paged rather than dumped into the context.
 */

import * as z from 'zod';

import type { FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { ManagedFileFact, TurnFileScope } from '../resources/managedFileResolver';
import {
  decodeManagedUtf8,
  describeManagedTextFailure,
  ManagedTextError,
} from '../resources/managedText';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const READ_FILE_TOOL_NAME = 'read_file';
export const READ_FILE_MAX_SOURCE_BYTES = 1_048_576;
export const READ_FILE_DEFAULT_LINE_LIMIT = 500;
export const READ_FILE_MAX_LINE_LIMIT = 2_000;
/** Below the attachment projection budget: a read is a window, not an attachment. */
export const READ_FILE_MAX_CHARACTERS = 100_000;

export const readFileInputSchema = z.strictObject({
  file_entry_id: z
    .string()
    .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.')
    .describe('Managed file id from an attachment or an earlier file tool result.'),
  offset: z
    .int()
    .nonnegative()
    .optional()
    .describe('Zero-based line to start from. Defaults to 0.'),
  limit: z
    .int()
    .min(1)
    .max(READ_FILE_MAX_LINE_LIMIT)
    .optional()
    .describe(`Maximum lines to return. Defaults to ${READ_FILE_DEFAULT_LINE_LIMIT}.`),
});

export type ReadFileFiles = {
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  resolveAvailable(ids: readonly FileEntryId[]): Promise<ReadonlyMap<string, ManagedFileFact>>;
};

export function createReadFileTool(files: ReadFileFiles, scope: TurnFileScope): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: READ_FILE_TOOL_NAME },
    providerName: READ_FILE_TOOL_NAME,
    displayName: 'Read file',
    description:
      'Read a window of lines from a Cherry-managed UTF-8 text file referenced in this conversation. Use file_entry_id from an attachment or an earlier file tool result. Page with offset and limit when the result reports truncated: true.',
    inputSchema: toRuntimeInputSchema(readFileInputSchema),
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = readFileInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      }
      const { file_entry_id, limit = READ_FILE_DEFAULT_LINE_LIMIT, offset = 0 } = parsed.data;
      const fileEntryId = FileEntryIdSchema.parse(file_entry_id);
      if (!scope.fileEntryIds.has(fileEntryId)) {
        return invalid('The file is not part of this conversation.');
      }

      signal.throwIfAborted();
      const source = (await files.resolveAvailable([fileEntryId])).get(fileEntryId);
      if (!source) {
        return invalid('The managed file is unavailable.');
      }
      if (source.size > READ_FILE_MAX_SOURCE_BYTES) {
        return invalid(`The file exceeds the ${READ_FILE_MAX_SOURCE_BYTES}-byte limit.`);
      }

      let bytes: Uint8Array | undefined;
      try {
        bytes = await files.readAsBytes(source, signal);
      } catch {
        signal.throwIfAborted();
        return invalid('The managed file could not be read.');
      }
      signal.throwIfAborted();
      if (!bytes) {
        return invalid('The managed file is unavailable.');
      }

      let text: string;
      try {
        text = decodeManagedUtf8(bytes, READ_FILE_MAX_SOURCE_BYTES).text;
      } catch (error) {
        if (error instanceof ManagedTextError) {
          return invalid(describeManagedTextFailure(error.failure, READ_FILE_MAX_SOURCE_BYTES));
        }
        throw error;
      }

      const window = lineWindow(text, offset, limit);
      return {
        value: {
          status: 'ok',
          fileEntryId,
          filename: source.name,
          size: source.size,
          offset,
          lineCount: window.lineCount,
          totalLines: window.totalLines,
          truncated: window.truncated,
          text: window.text,
        },
        artifacts: [],
      };
    },
  };
}

type LineWindow = { lineCount: number; text: string; totalLines: number; truncated: boolean };

/**
 * `limit` lines from `offset`, cut further to the character budget on a line
 * boundary so `offset + lineCount` is always the next line to ask for.
 */
export function lineWindow(text: string, offset: number, limit: number): LineWindow {
  const lines = text.split('\n');
  const totalLines = lines.length;
  const requested = lines.slice(offset, offset + limit);
  const kept: string[] = [];
  let characters = 0;
  for (const line of requested) {
    const cost = line.length + (kept.length > 0 ? 1 : 0);
    if (characters + cost > READ_FILE_MAX_CHARACTERS) {
      break;
    }
    kept.push(line);
    characters += cost;
  }
  if (kept.length === 0 && requested.length > 0) {
    // One line over budget alone: return its head rather than nothing.
    kept.push(requested[0]!.slice(0, READ_FILE_MAX_CHARACTERS));
  }
  return {
    lineCount: kept.length,
    text: kept.join('\n'),
    totalLines,
    truncated: offset + kept.length < totalLines,
  };
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
