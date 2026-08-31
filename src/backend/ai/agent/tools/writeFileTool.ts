/**
 * `write_file`: the model saves text as a managed file.
 *
 * Bounded on purpose (docs/references/agent/agent-tools-and-resources.md): UTF-8
 * text only, one new entry per call, no path and no overwrite. The model names
 * the file; where the bytes live is Cherry's business, so the result carries an
 * entry id rather than a URI.
 */

import * as z from 'zod';

import {
  type FileEntry,
  type FileEntryProvenance,
  filenameExtension,
  SafeNameSchema,
} from '@/shared/data/types/file';

import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const WRITE_FILE_TOOL_NAME = 'write_file';

/** Far above any model's output budget: a larger body is a malfunction. */
export const WRITE_FILE_MAX_CONTENT_BYTES = 1_048_576;

const DEFAULT_EXTENSION = 'txt';
const FALLBACK_MEDIA_TYPE = 'text/plain';

/**
 * Only extensions whose media type earns something (preview, library filter).
 * Anything absent falls back to `text/plain`, which is also why source-code
 * extensions are left out: `ts` maps to `video/mp2t` in the IANA registry.
 */
const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  css: 'text/css',
  csv: 'text/csv',
  htm: 'text/html',
  html: 'text/html',
  json: 'application/json',
  markdown: 'text/markdown',
  md: 'text/markdown',
  tsv: 'text/tab-separated-values',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
};

export const writeFileInputSchema = z.strictObject({
  content: z.string().describe('The full text to write. UTF-8, at most 1 MB.'),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe(
      'Display name including its extension, e.g. `report.md`. Not a path: it must not contain `/` or `\\`.',
    ),
});

/** The slice of the managed-file port this tool needs. */
export type WriteFileFiles = {
  createTextEntry(input: {
    data: string;
    mediaType: string;
    name: string;
    provenance: FileEntryProvenance;
  }): Promise<FileEntry>;
};

export function createWriteFileTool(files: WriteFileFiles): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: WRITE_FILE_TOOL_NAME },
    providerName: WRITE_FILE_TOOL_NAME,
    displayName: 'Write file',
    description:
      "Save text as a file in the user's file library. Use it only when the user asks to save, export, or download something as a file; otherwise answer in the conversation.",
    inputSchema: toRuntimeInputSchema(writeFileInputSchema),
    // The catalog overrides this from the resolved binding policy; the value
    // here is only the floor this tool declares for itself.
    approval: 'auto',
    async execute({ input, signal }) {
      const parsed = writeFileInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      }

      const filename = normalizeFilename(parsed.data.filename);
      if (!filename) {
        return invalid(
          'Invalid filename: give a plain name with an extension, such as `report.md`, without path separators.',
        );
      }

      const size = new TextEncoder().encode(parsed.data.content).length;
      if (size > WRITE_FILE_MAX_CONTENT_BYTES) {
        return invalid(
          `Content is ${size} bytes, over the ${WRITE_FILE_MAX_CONTENT_BYTES}-byte limit. Write less, or split it across files.`,
        );
      }

      // A cancelled turn must not add entries to the library.
      signal.throwIfAborted();
      const entry = await files.createTextEntry({
        data: parsed.data.content,
        mediaType: mediaTypeForFilename(filename),
        name: filename,
        provenance: 'generated',
      });

      return {
        value: {
          status: 'created',
          fileEntryId: entry.id,
          filename: entry.filename,
          size: entry.size,
        },
        artifacts: [
          {
            ref: { kind: 'managed-file', fileEntryId: entry.id },
            mediaType: entry.mediaType,
            name: entry.filename,
            kind: 'created',
          },
        ],
      };
    },
  };
}

/**
 * A rejection the model can act on. Thrown errors reach it as an opaque
 * "Tool execution failed", so anything it could fix by retrying is a value.
 */
function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}

/**
 * Applies the same rules the file library stores by, and adds an extension when
 * the model omitted one. Null means no safe name is recoverable.
 */
function normalizeFilename(filename: string): string | null {
  const trimmed = filename.replace(/[\s.]+$/, '');
  if (!SafeNameSchema.safeParse(trimmed).success) {
    return null;
  }
  const named = filenameExtension(trimmed) ? trimmed : `${trimmed}.${DEFAULT_EXTENSION}`;
  return SafeNameSchema.safeParse(named).success ? named : null;
}

function mediaTypeForFilename(filename: string): string {
  const extension = filenameExtension(filename);
  return (extension && MEDIA_TYPES_BY_EXTENSION[extension]) || FALLBACK_MEDIA_TYPE;
}
