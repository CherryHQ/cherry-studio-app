/**
 * `read_file`: the model reads a managed text or document file it already holds a
 * reference to.
 *
 * Reads expose content, so unlike `edit_file` this tool is ledger-scoped: only
 * an entry attached to the Session, produced by an earlier turn, or created in
 * this turn can be read. Output is a bounded line or code-point window so a large file is
 * paged rather than dumped into the context.
 */

import * as z from 'zod';

import type { ParsedDocument } from '@/backend/services/file/documentParser';
import {
  readAttachmentContent,
  type ReadAttachmentContent,
} from '@/backend/services/file/readAttachmentContent';
import { countCodePoints, takeCodePoints } from '@/backend/services/file/utf8Text';
import {
  DEFAULT_DOCUMENT_PARSER_MODE,
  FileAttachmentError,
  type DocumentParserMode,
} from '@/shared/contracts/fileAttachment';
import type { FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import type {
  ManagedFileFact,
  ManagedFileResolver,
  TurnFileScope,
} from '../resources/managedFileResolver';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const READ_FILE_TOOL_NAME = 'read_file';
export const READ_FILE_MAX_SOURCE_BYTES = MAX_TEXT_ATTACHMENT_BYTES;
export const READ_FILE_DEFAULT_LINE_LIMIT = 500;
export const READ_FILE_MAX_LINE_LIMIT = 2_000;
/** Below the attachment projection budget: a read is a window, not an attachment. */
export const READ_FILE_MAX_CHARACTERS = 100_000;

export const readFileInputSchema = z.strictObject({
  file_entry_id: z
    .string()
    .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.')
    .describe('Managed file id from an attachment or an earlier file tool result.'),
  start_line: z.int().min(1).optional().describe('One-based line to start from. Defaults to 1.'),
  limit: z
    .int()
    .min(1)
    .max(READ_FILE_MAX_LINE_LIMIT)
    .optional()
    .describe(`Maximum lines to return. Defaults to ${READ_FILE_DEFAULT_LINE_LIMIT}.`),
  offset: z
    .int()
    .min(0)
    .optional()
    .describe(
      'Zero-based Unicode code-point offset into the full text (AnyDoc: its IR JSON). Defaults to 0; continue with nextOffset.',
    ),
  max_characters: z
    .int()
    .min(1)
    .max(READ_FILE_MAX_CHARACTERS)
    .optional()
    .describe(
      `Maximum Unicode code points from offset. Defaults to ${READ_FILE_MAX_CHARACTERS}. Do not combine with start_line or limit.`,
    ),
});

export type ReadFileFiles = {
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  resolveAvailable(ids: readonly FileEntryId[]): Promise<ReadonlyMap<string, ManagedFileFact>>;
  readDocumentText: ManagedFileResolver['readDocumentText'];
};

type ReadContent =
  | Extract<ReadAttachmentContent, { kind: 'text' }>
  | (Extract<ReadAttachmentContent, { kind: 'document' }> & { json: string });

export function createReadFileTool(
  files: ReadFileFiles,
  scope: TurnFileScope,
  documentParserMode: DocumentParserMode = DEFAULT_DOCUMENT_PARSER_MODE,
): RuntimeTool {
  /**
   * The last document this turn parsed, so paging a large document parses it
   * once rather than once per window. A document id always names the same
   * content — only UTF-8 drafts are rewritten in place — so it never goes stale.
   */
  let lastDocument: { id: FileEntryId; content: ReadContent } | undefined;

  const read = async (source: ManagedFileFact, signal: AbortSignal): Promise<ReadContent> => {
    if (lastDocument?.id === source.fileEntryId) return lastDocument.content;
    const content = await readAttachmentContent(
      source,
      {
        readBytes: (file, readSignal) => files.readAsBytes(file, readSignal),
        readDocumentText: (file, readSignal) => files.readDocumentText(file, readSignal),
      },
      signal,
      READ_FILE_MAX_SOURCE_BYTES,
      documentParserMode,
    );
    const result: ReadContent =
      content.kind === 'document'
        ? { ...content, json: JSON.stringify(content.parsed.output.ir) }
        : content;
    if (documentFileTypeFromMediaType(source.mediaType)) {
      lastDocument = { id: source.fileEntryId, content: result };
    }
    return result;
  };

  return {
    ref: { source: 'builtin', capabilityId: READ_FILE_TOOL_NAME },
    providerName: READ_FILE_TOOL_NAME,
    displayName: 'Read file',
    description: `Read a Cherry-managed file referenced in this conversation. Use file_entry_id from an attachment or an earlier file tool result. This turn uses the ${documentParserMode} document parser. ${
      documentParserMode === 'anydoc'
        ? 'Office, ODF, RTF, and EPUB return original AnyDoc IR JSON as explicit json-fragment windows. Use offset and max_characters, never line parameters; concatenate text windows in order to recover JSON.stringify(original IR). Continue with nextOffset until complete. Unknown fields and styles are retained. Asset descriptors are references only: this tool sends no image pixels.'
        : 'DOCX, PPTX, and XLSX return built-in extracted text. Legacy Office, ODF, RTF, and EPUB are unsupported by this parser.'
    } PDF and ordinary text page by start_line and limit; lines start at 1, and when truncated, continue at startLine + lineCount. A line larger than one window is cut, flagged with lineTruncated, and continues with offset set to nextOffset. offset and max_characters read PDF and ordinary text as a raw code-point window instead of lines. sourceTruncated means the extractor reached its own limit. No image pixels are returned by this tool.`,
    inputSchema: toRuntimeInputSchema(readFileInputSchema),
    approval: 'auto',
    async execute({ input, signal }): Promise<RuntimeToolResult> {
      const parsed = readFileInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid(`Invalid input: ${z.prettifyError(parsed.error)}`);
      }
      const {
        file_entry_id,
        limit = READ_FILE_DEFAULT_LINE_LIMIT,
        start_line = 1,
        offset = 0,
        max_characters = READ_FILE_MAX_CHARACTERS,
      } = parsed.data;
      const hasLineParameters =
        parsed.data.start_line !== undefined || parsed.data.limit !== undefined;
      const hasJsonParameters =
        parsed.data.offset !== undefined || parsed.data.max_characters !== undefined;
      if (hasLineParameters && hasJsonParameters)
        return invalid('Line parameters and offset parameters cannot be combined.');
      const fileEntryId = FileEntryIdSchema.parse(file_entry_id);
      if (!scope.fileEntryIds.has(fileEntryId)) {
        return invalid('The file is not part of this conversation.');
      }

      signal.throwIfAborted();
      const source = (await files.resolveAvailable([fileEntryId])).get(fileEntryId);
      if (!source) {
        return invalid('The managed file is unavailable.');
      }
      let text: string;
      let sourceTruncated: boolean;
      let parser: 'builtin' | 'native-pdf' | undefined;
      try {
        const content = await read(source, signal);
        if (content.kind === 'document') {
          if (hasLineParameters)
            return invalid('AnyDoc JSON requires offset/max_characters, not start_line/limit.');
          const { parsed: document } = content;
          const window = characterWindow(content.json, offset, max_characters);
          return {
            value: {
              status: 'ok',
              fileEntryId,
              filename: source.name,
              size: source.size,
              parser: document.parser,
              parserVersion: document.parserVersion,
              format: 'json-fragment',
              ...window,
              warnings: document.output.warnings,
              assets: document.output.assets.map((asset) => ({
                assetRef: asset.assetRef,
                contentType: asset.contentType,
                size: asset.bytes.byteLength,
                delivery: 'reference-only',
              })),
            },
            artifacts: [],
          };
        }
        ({ text, sourceTruncated, parser } = content);
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof FileAttachmentError) {
          const cause = error.cause as ParsedDocument | undefined;
          if (cause?.parser === 'anydoc' && cause.output?.status === 'fallback') {
            return {
              value: {
                status: 'error',
                message: error.message,
                parser: cause.parser,
                parserVersion: cause.parserVersion,
                result: cause.output,
              },
              artifacts: [],
            };
          }
          return invalid(
            error.issue.code === 'document-empty'
              ? 'The document has no extractable text. Scanned or image-only documents require OCR.'
              : error.message,
          );
        }
        return invalid('The managed file could not be read.');
      }
      signal.throwIfAborted();

      const header = {
        status: 'ok',
        fileEntryId,
        filename: source.name,
        size: source.size,
        ...(parser ? { parser } : {}),
      };
      if (hasJsonParameters) {
        return {
          value: {
            ...header,
            ...characterWindow(text, offset, max_characters),
            ...(sourceTruncated ? { sourceTruncated: true } : {}),
          },
          artifacts: [],
        };
      }
      const window = lineWindow(text, start_line, limit);
      return {
        value: {
          ...header,
          startLine: start_line,
          lineCount: window.lineCount,
          totalLines: window.totalLines,
          truncated: window.truncated,
          ...(sourceTruncated ? { sourceTruncated: true } : {}),
          ...(window.nextOffset !== undefined
            ? { lineTruncated: true, nextOffset: window.nextOffset }
            : {}),
          text: window.text,
        },
        artifacts: [],
      };
    },
  };
}

/** One linear scan; windows concatenate losslessly even through long strings and surrogate pairs. */
export function characterWindow(text: string, offset: number, maxCharacters: number) {
  let totalCharacters = 0;
  let utf16Offset = 0;
  let start = text.length;
  let end = text.length;
  for (const character of text) {
    if (totalCharacters === offset) start = utf16Offset;
    if (totalCharacters === offset + maxCharacters) end = utf16Offset;
    totalCharacters += 1;
    utf16Offset += character.length;
  }
  const characterCount = Math.min(maxCharacters, Math.max(0, totalCharacters - offset));
  const complete = offset + characterCount >= totalCharacters;
  return {
    offset,
    characterCount,
    totalCharacters,
    nextOffset: complete ? null : offset + characterCount,
    complete,
    text: text.slice(start, end),
  };
}

type LineWindow = {
  lineCount: number;
  /** Set only when one line alone overran the budget: where its rest starts, as a code-point `offset`. */
  nextOffset?: number;
  text: string;
  totalLines: number;
  truncated: boolean;
};

/**
 * `limit` lines from `startLine` (one-based), cut further to the character
 * budget on a line boundary so `startLine + lineCount` is always the next line
 * to ask for.
 */
export function lineWindow(text: string, startLine: number, limit: number): LineWindow {
  const lines = text.split('\n');
  // A newline-terminated file ends with an empty trailing element that is not a
  // line; counting it would over-report the file and cost an empty last page.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const totalLines = lines.length;
  const start = startLine - 1;
  const requested = lines.slice(start, start + limit);
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
  let nextOffset: number | undefined;
  if (kept.length === 0 && requested.length > 0) {
    // One line over budget alone: return its head. A later line cannot reach
    // the rest, so the result hands over the code-point offset that does.
    const head = takeCodePoints(requested[0]!, READ_FILE_MAX_CHARACTERS);
    kept.push(head.value);
    if (head.didTruncate) {
      const lineStart = start === 0 ? 0 : countCodePoints(lines.slice(0, start).join('\n')) + 1;
      nextOffset = lineStart + head.characters;
    }
  }
  return {
    lineCount: kept.length,
    ...(nextOffset !== undefined ? { nextOffset } : {}),
    text: kept.join('\n'),
    totalLines,
    truncated: nextOffset !== undefined || start + kept.length < totalLines,
  };
}

function invalid(message: string): RuntimeToolResult {
  return { value: { status: 'error', message }, artifacts: [] };
}
