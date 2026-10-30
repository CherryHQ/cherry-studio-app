/**
 * `read_file`: the model reads a managed text, document, or image file it already holds a
 * reference to.
 *
 * Reads allow conversation references and the selected workspace. Outside
 * library access goes through the library_read_file tool.
 * Output is a bounded line or code-point window so a large file is
 * paged rather than dumped into the context.
 */

import * as z from 'zod';

import type { ParsedDocument } from '@/backend/services/file/documentParser';
import { linkFileOcr } from '@/backend/services/file/fileTextExtraction';
import {
  readAttachmentContent,
  type ReadAttachmentContent,
} from '@/backend/services/file/readAttachmentContent';
import { countCodePoints } from '@/backend/services/file/utf8Text';
import {
  DEFAULT_DOCUMENT_PARSER_MODE,
  FileAttachmentError,
  type DocumentParserMode,
  type FileAttachmentIssue,
} from '@/shared/contracts/fileAttachment';
import type { FileEntryId } from '@/shared/data/types/file';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { documentFileTypeFromMediaType } from '@/shared/utils/documentFileTypes';
import {
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
} from '@/shared/utils/fileAttachmentPolicy';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import type {
  ManagedFileFact,
  ManagedFileResolver,
  TurnFileScope,
} from '../resources/managedFileResolver';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';
import type { WorkspaceFileAccess } from './workspaceFileAccess';

export const READ_FILE_TOOL_NAME = 'read_file';
export const READ_FILE_MAX_SOURCE_BYTES = MAX_TEXT_ATTACHMENT_BYTES;
export const READ_FILE_DEFAULT_LINE_LIMIT = 500;
export const READ_FILE_MAX_LINE_LIMIT = 2_000;
/** Below the attachment projection budget: a read is a window, not an attachment. */
export const READ_FILE_MAX_CHARACTERS = 100_000;
/**
 * Pi keeps only the first 50 KiB of a model-facing tool result. A window's text,
 * measured as it appears inside the serialized result, stops below that, leaving
 * room for the other fields, so `nextOffset` never skips text the model was cut off from.
 */
export const READ_FILE_MAX_TEXT_BYTES = 40 * 1024;

export const readFileInputSchema = z.strictObject({
  file_entry_id: z
    .string()
    .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.')
    .describe('Managed file id from an attachment or an earlier file tool result.')
    .optional(),
  path: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe(
      'Relative workspace path; use instead of file_entry_id. Returns the current version id.',
    ),
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
      `Maximum Unicode code points from offset. Defaults to ${READ_FILE_MAX_CHARACTERS}; a window also ends at about 40 KB of text, so continue with nextOffset. Do not combine with start_line or limit.`,
    ),
});

export type ReadFileFiles = {
  readImage?: ManagedFileResolver['readImage'];
  readImageText: ManagedFileResolver['readImageText'];
  readAsBytes(file: ManagedFileFact, signal: AbortSignal): Promise<Uint8Array | undefined>;
  resolveAvailable(ids: readonly FileEntryId[]): Promise<ReadonlyMap<string, ManagedFileFact>>;
  readDocumentText: ManagedFileResolver['readDocumentText'];
};

type ReadContent =
  | Extract<ReadAttachmentContent, { kind: 'text' }>
  | (Extract<ReadAttachmentContent, { kind: 'document' }> & { json: string });

const NEEDS_VISION =
  'The current model cannot receive image pixels; tell the user that a vision-capable model is needed to inspect it.';
/** Read failures addressed to the model; the shared diagnostics address the user. */
const MODEL_FACING_READ_ERRORS: Partial<Record<FileAttachmentIssue['code'], string>> = {
  'document-empty':
    'The document has no readable text after extraction and any applicable PDF text recognition. Ask the user for a clearer scan or to attach the relevant pages as images.',
  'image-ocr-empty': `On-device OCR found no readable text in this image. ${NEEDS_VISION}`,
  'image-ocr-failed': `On-device OCR could not read this image; do not retry unchanged. ${NEEDS_VISION}`,
  'image-ocr-unsupported': `On-device OCR does not support the current app language. ${NEEDS_VISION}`,
};

export function createReadFileTool(
  files: ReadFileFiles,
  scope: TurnFileScope,
  documentParserMode: DocumentParserMode = DEFAULT_DOCUMENT_PARSER_MODE,
  access?: WorkspaceFileAccess,
  acceptsImages = true,
): RuntimeTool {
  /**
   * The last document this turn parsed, so paging a large document parses it
   * once rather than once per window. A document id always names the same
   * content — only UTF-8 drafts are rewritten in place — so it never goes stale.
   */
  let lastDocument: { id: FileEntryId; content: ReadContent } | undefined;

  const read = async (
    source: ManagedFileFact,
    signal: AbortSignal,
    toolCallId: string,
  ): Promise<ReadContent> => {
    if (lastDocument?.id === source.fileEntryId) return lastDocument.content;
    // The tool row observes recognition by call ID, including reads by workspace path.
    const unlinkOcr = linkFileOcr(toolCallId, source.fileEntryId);
    const content = await readAttachmentContent(
      source,
      {
        readBytes: (file, readSignal) => files.readAsBytes(file, readSignal),
        readDocumentText: (file, readSignal) => files.readDocumentText(file, readSignal),
        readImageText: (file, readSignal) => files.readImageText(file, readSignal),
      },
      signal,
      READ_FILE_MAX_SOURCE_BYTES,
      documentParserMode,
    ).finally(unlinkOcr);
    const result: ReadContent =
      content.kind === 'document'
        ? { ...content, json: JSON.stringify(content.parsed.output.ir) }
        : content;
    if (
      documentFileTypeFromMediaType(source.mediaType) ||
      isAiSupportedImageMediaType(source.mediaType)
    ) {
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
        ? 'Office, ODF, RTF, and EPUB return original AnyDoc IR JSON as explicit json-fragment windows. Use offset and max_characters, never line parameters; concatenate text windows in order to recover JSON.stringify(original IR). Continue with nextOffset until complete. Unknown fields and styles are retained. Embedded document assets are references only; they do not send image pixels.'
        : 'DOCX, PPTX, and XLSX return built-in extracted text. Legacy Office, ODF, RTF, and EPUB are unsupported by this parser.'
    } PDF and ordinary text page by start_line and limit; lines start at 1, and when truncated, continue at startLine + lineCount. A line larger than one window is cut, flagged with lineTruncated, and continues with offset set to nextOffset. offset and max_characters read PDF and ordinary text as a raw code-point window instead of lines. sourceTruncated means the extractor reached its own limit. ${
      acceptsImages
        ? 'PNG, JPEG, WebP and GIF reads return bounded image pixels; omit paging parameters. Code Mode receives image metadata only: use a direct read_file call to inspect pixels. After history is rebuilt, read the image again if its pixels are no longer available.'
        : 'PNG, JPEG, WebP and GIF reads return on-device OCR text from the first frame, with the same text paging parameters. No image pixels are sent; visual details and layout may be missing.'
    }`,
    inputSchema: toRuntimeInputSchema(readFileInputSchema),
    approval: 'auto',
    async execute({ input, signal, toolCallId }): Promise<RuntimeToolResult> {
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
      if (!access && (!file_entry_id || parsed.data.path))
        return invalid('Provide a managed file_entry_id.');
      const fileEntryId = access
        ? await access.resolveRead(parsed.data)
        : FileEntryIdSchema.parse(file_entry_id);
      if (!access && !scope.fileEntryIds.has(fileEntryId)) {
        return invalid('The file is not part of this conversation.');
      }

      signal.throwIfAborted();
      const source = (await files.resolveAvailable([fileEntryId])).get(fileEntryId);
      if (!source) {
        return invalid('The managed file is unavailable.');
      }
      if (isAiSupportedImageMediaType(source.mediaType) && acceptsImages) {
        if (source.size > MAX_IMAGE_ATTACHMENT_BYTES)
          return invalid('The image exceeds the attachment byte limit.');
        if (hasLineParameters || hasJsonParameters)
          return invalid('Images do not support paging parameters.');
        try {
          const image = await files.readImage?.(source, signal);
          signal.throwIfAborted();
          if (!image) return invalid('The image could not be read within the model image budget.');
          return {
            value: {
              status: 'ok',
              fileEntryId,
              ...(source.revision !== undefined ? { revision: source.revision } : {}),
              filename: source.name,
              mediaType: image.mediaType,
              delivery:
                'image-to-model; scripts receive metadata only; read again if pixels are unavailable after rebuilding history',
            },
            modelImages: [image],
            artifacts: [],
          };
        } catch {
          signal.throwIfAborted();
          return invalid('The managed image could not be read.');
        }
      }
      let text: string;
      let sourceTruncated: boolean;
      let unrecognizedPages: number[] | undefined;
      let parser: 'builtin' | 'native-pdf' | 'native-image-ocr' | undefined;
      try {
        const content = await read(source, signal, toolCallId);
        if (content.kind === 'document') {
          if (hasLineParameters)
            return invalid('AnyDoc JSON requires offset/max_characters, not start_line/limit.');
          const { parsed: document } = content;
          const window = characterWindow(content.json, offset, max_characters);
          return {
            value: {
              status: 'ok',
              fileEntryId,
              ...(source.revision !== undefined ? { revision: source.revision } : {}),
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
        ({ text, sourceTruncated, parser, unrecognizedPages } = content);
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
          return invalid(MODEL_FACING_READ_ERRORS[error.issue.code] ?? error.message);
        }
        return invalid('The managed file could not be read.');
      }
      signal.throwIfAborted();

      const header = {
        status: 'ok',
        fileEntryId,
        ...(source.revision !== undefined ? { revision: source.revision } : {}),
        filename: source.name,
        size: source.size,
        ...(parser ? { parser } : {}),
        ...(parser === 'native-image-ocr'
          ? {
              delivery:
                'ocr-text-only; first frame; image pixels and visual details are not available to the model',
            }
          : {}),
        ...(unrecognizedPages ? { unrecognizedPages } : {}),
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
  let stop: number | undefined;
  let bytes = 0;
  for (const character of text) {
    if (totalCharacters === offset) start = utf16Offset;
    if (totalCharacters >= offset && stop === undefined) {
      bytes += serializedBytes(character);
      if (totalCharacters === offset + maxCharacters || bytes > READ_FILE_MAX_TEXT_BYTES) {
        stop = totalCharacters;
        end = utf16Offset;
      }
    }
    totalCharacters += 1;
    utf16Offset += character.length;
  }
  const characterCount = Math.max(0, (stop ?? totalCharacters) - offset);
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

/** UTF-8 bytes of one code point inside a JSON string, escapes included. */
function serializedBytes(character: string): number {
  const code = character.codePointAt(0)!;
  if (code === 0x22 || code === 0x5c) return 2;
  if (code < 0x20) return [0x08, 0x09, 0x0a, 0x0c, 0x0d].includes(code) ? 2 : 6;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  // JSON.stringify escapes a lone surrogate as \uXXXX.
  if (code >= 0xd800 && code <= 0xdfff) return 6;
  return code < 0x10000 ? 3 : 4;
}

/** Serialized bytes of `text`, stopping once they exceed `limit`. */
function textBytes(text: string, limit: number): number {
  let bytes = 0;
  for (const character of text) {
    bytes += serializedBytes(character);
    if (bytes > limit) break;
  }
  return bytes;
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
 * `limit` lines from `startLine` (one-based), cut further to the serialized-size
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
  // Serialized bytes never undercount UTF-16 length, so this budget also bounds characters.
  let bytes = 0;
  for (const line of requested) {
    // An escaped newline separator is two bytes.
    const separator = kept.length > 0 ? 2 : 0;
    const size = textBytes(line, READ_FILE_MAX_TEXT_BYTES - bytes - separator) + separator;
    if (bytes + size > READ_FILE_MAX_TEXT_BYTES) {
      break;
    }
    kept.push(line);
    bytes += size;
  }
  let nextOffset: number | undefined;
  if (kept.length === 0 && requested.length > 0) {
    // One line over budget alone: return its head. A later line cannot reach
    // the rest, so the result hands over the code-point offset that does.
    const head = characterWindow(requested[0]!, 0, READ_FILE_MAX_CHARACTERS);
    kept.push(head.text);
    if (!head.complete) {
      const lineStart = start === 0 ? 0 : countCodePoints(lines.slice(0, start).join('\n')) + 1;
      nextOffset = lineStart + head.characterCount;
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
