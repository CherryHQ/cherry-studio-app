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
  ]),
  fileEntryId: FileEntryIdSchema.optional(),
  name: z.string().optional(),
  limit: z.number().nonnegative().optional(),
});
export type FileAttachmentIssue = z.infer<typeof FileAttachmentIssueSchema>;

export class FileAttachmentError extends Error {
  constructor(readonly issue: FileAttachmentIssue) {
    super(fileAttachmentDiagnostic(issue));
    this.name = 'FileAttachmentError';
  }
}

/** Persist facts about what was sent, never extracted file bodies. */
export const FileAttachmentReportSchema = z.strictObject({
  mode: z.enum(['image', 'text', 'document-text']),
  sourceTruncated: z.boolean(),
  requestTruncated: z.boolean(),
  includedCharacters: z.number().int().nonnegative().optional(),
});
export type FileAttachmentReport = z.infer<typeof FileAttachmentReportSchema>;

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
    default:
      return `${name}: ${issue.code}`;
  }
}
