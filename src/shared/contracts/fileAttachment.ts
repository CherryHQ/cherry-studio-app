import * as z from 'zod';

import { FileEntryIdSchema } from '@/shared/data/types/file';

export const FileAttachmentIssueSchema = z.strictObject({
  code: z.enum([
    'unavailable',
    'metadata-mismatch',
    'unsupported-type',
    'model-unsupported',
    'runtime-unsupported',
    'count',
    'file-bytes',
    'total-bytes',
    'context',
    'binary-content',
    'invalid-utf8',
    'nul-byte',
    'document-empty',
    'document-invalid',
    'parser-unavailable',
    'parser-unsupported',
  ]),
  fileEntryId: FileEntryIdSchema.optional(),
  name: z.string().optional(),
  limit: z.number().nonnegative().optional(),
});
export type FileAttachmentIssue = z.infer<typeof FileAttachmentIssueSchema>;

export class FileAttachmentError extends Error {
  constructor(
    readonly issue: FileAttachmentIssue,
    options?: ErrorOptions,
  ) {
    super(fileAttachmentDiagnostic(issue), options);
    this.name = 'FileAttachmentError';
  }
}

/** Persist facts about what was sent, never extracted file bodies. */
export const FileAttachmentReportSchema = z.strictObject({
  mode: z.enum(['image', 'text', 'document-text', 'document-ir']),
  sourceTruncated: z.boolean(),
  requestTruncated: z.boolean(),
  includedCharacters: z.number().int().nonnegative().optional(),
  parser: z.enum(['anydoc', 'builtin', 'native-pdf']).optional(),
  parserVersion: z.string().optional(),
  delivery: z.enum(['complete', 'deferred']).optional(),
  images: z
    .strictObject({
      sent: z.number().int().nonnegative(),
      omitted: z.number().int().nonnegative(),
      omittedReasons: z
        .array(z.enum(['model-unsupported', 'unsupported-type', 'budget']))
        .optional(),
    })
    .optional(),
});
export type FileAttachmentReport = z.infer<typeof FileAttachmentReportSchema>;

export type DocumentParserMode = 'anydoc' | 'builtin';
export const DEFAULT_DOCUMENT_PARSER_MODE: DocumentParserMode = 'anydoc';

/** Opaque JSON, not a schema for a particular community IR version. */
export type DocumentJsonValue =
  | null
  | boolean
  | number
  | string
  | DocumentJsonValue[]
  | { [key: string]: DocumentJsonValue };

export type DocumentAsset = {
  assetRef: string;
  contentType: string | null;
  bytes: ArrayBuffer;
};

export type DocumentAssetDelivery = {
  assetRef: string;
  contentType: string | null;
  size: number;
  status: 'sent' | 'model-unsupported' | 'unsupported-type' | 'budget';
};

/** Ephemeral send-time content. Neither IR nor derived image bytes are persisted. */
export type FileAttachmentContent =
  | { kind: 'text'; text: string }
  | {
      kind: 'document';
      parser: 'anydoc';
      parserVersion: string;
      totalCharacters: number;
      document:
        | {
            delivery: 'complete';
            result: { status: 'ok'; ir: DocumentJsonValue; warnings: string[] };
          }
        | { delivery: 'deferred' };
      assetDelivery: DocumentAssetDelivery[];
      /** Only admitted images travel to the runtime; references in the IR are unchanged. */
      assets: DocumentAsset[];
    };

export type FileAttachmentFact = {
  fileEntryId: z.infer<typeof FileEntryIdSchema>;
  mediaType: string;
  name: string;
  size: number;
};

/** Supplied by the business backend after resolving the actual selected model. */
export type FileAttachmentTarget = {
  purpose: 'chat' | 'painting';
  acceptsImages: boolean;
  maxImages?: number;
  maxInputTokens?: number;
};

function fileAttachmentDiagnostic(issue: FileAttachmentIssue): string {
  const name = `Attachment ${JSON.stringify(issue.name ?? '')}`;
  switch (issue.code) {
    case 'model-unsupported':
      return 'The selected model does not accept these attachments.';
    case 'file-bytes':
      return `${name} exceeds the ${issue.limit}-byte file limit.`;
    case 'nul-byte':
      return `${name} contains NUL bytes and appears to be binary.`;
    case 'invalid-utf8':
      return `${name} is not valid UTF-8 text.`;
    case 'binary-content':
      return `${name} contains binary control characters.`;
    case 'document-empty':
      return `${name} has no extractable text. Scanned documents require OCR.`;
    case 'document-invalid':
      return `${name} could not be parsed. It may be damaged or password-protected.`;
    case 'parser-unavailable':
      return 'The document parser is unavailable. Rebuild the development client or select the built-in parser.';
    case 'parser-unsupported':
      return `${name} is not supported by the selected document parser.`;
    default:
      return `${name}: ${issue.code}`;
  }
}
