import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { z } from 'zod';

import {
  diagnosticDescriptionByteLength,
  DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
  normalizeDiagnosticDescription,
  type DiagnosticUploadFailureReason,
} from '@/shared/contracts/diagnostics';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';

const ARCHIVE_LIMIT_BYTES = 100 * 1024 * 1024;
const CLIENT_ID = 'cherry-studio';
const UploadResponseSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  status: z.literal('pending'),
});
const ErrorResponseSchema = z.object({ error: z.object({ code: z.string() }) });
const ERROR_REASONS: Record<string, DiagnosticUploadFailureReason | undefined> = {
  invalid_request: 'submission_rejected',
  invalid_content_type: 'submission_rejected',
  invalid_file_size: 'invalid_archive',
  invalid_diagnostic_archive: 'invalid_archive',
  unsupported_signature_version: 'authentication_failed',
  invalid_signature_headers: 'authentication_failed',
  invalid_timestamp: 'authentication_failed',
  expired_timestamp: 'authentication_failed',
  invalid_signature: 'authentication_failed',
  request_too_large: 'archive_too_large',
  upload_too_large: 'archive_too_large',
  upload_rate_limited: 'rate_limited',
  upload_capacity_exceeded: 'service_unavailable',
  storage_unavailable: 'service_unavailable',
  diagnostic_storage_failed: 'service_unavailable',
};

export type CherryDiagnosticUploadResult =
  | { status: 'uploaded'; reportId: string }
  | { status: 'rejected'; reason: DiagnosticUploadFailureReason }
  | { status: 'submission_unknown' };

export class CherryDiagnosticUploadClient {
  get isAvailable(): boolean {
    try {
      return getNativeDiagnostics().isUploadConfigured();
    } catch {
      // Older development clients may not include the configured native transport.
      return false;
    }
  }

  async upload(input: {
    description: string;
    fileName: string;
    filePath: string;
    signal?: AbortSignal;
  }): Promise<CherryDiagnosticUploadResult> {
    input.signal?.throwIfAborted();
    if (!this.isAvailable) return { status: 'rejected', reason: 'not_configured' };
    const native = getNativeDiagnostics();
    const description = normalizeDiagnosticDescription(input.description);
    if (diagnosticDescriptionByteLength(description) > DIAGNOSTIC_DESCRIPTION_MAX_BYTES)
      return { status: 'rejected', reason: 'submission_rejected' };

    let fileSize: number;
    let fileSha256: string;
    let descriptionSha256: string;
    try {
      fileSize = native.identifyFile(input.filePath).size;
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || !/\.zip$/i.test(input.fileName))
        return { status: 'rejected', reason: 'invalid_archive' };
      if (fileSize > ARCHIVE_LIMIT_BYTES)
        return { status: 'rejected', reason: 'archive_too_large' };
      fileSha256 = await native.sha256(input.filePath);
      input.signal?.throwIfAborted();
      descriptionSha256 = await digestStringAsync(CryptoDigestAlgorithm.SHA256, description);
      input.signal?.throwIfAborted();
    } catch {
      input.signal?.throwIfAborted();
      return { status: 'rejected', reason: 'invalid_archive' };
    }

    // Sign only after hashing, so large archives do not consume the timestamp window.
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestId = randomUUID().toLowerCase();
    const headers: Record<string, string> = {
      'X-Signature-Version': '2',
      'X-Client-ID': CLIENT_ID,
      'X-Timestamp': timestamp,
      'X-Request-ID': requestId,
      'X-File-Size': fileSize.toString(),
      'X-File-SHA256': fileSha256,
      'X-Description-SHA256': descriptionSha256,
    };
    try {
      headers['X-Signature'] = await native.sign(
        [
          'v2',
          'POST',
          '/diagnostics',
          '',
          CLIENT_ID,
          timestamp,
          requestId,
          fileSize.toString(),
          fileSha256,
          descriptionSha256,
        ].join('\n'),
      );
    } catch {
      input.signal?.throwIfAborted();
      return { status: 'rejected', reason: 'authentication_failed' };
    }

    input.signal?.throwIfAborted();
    const cancel = () => native.cancelOperations();
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await native.upload(input.filePath, input.fileName, description, headers);
      input.signal?.throwIfAborted();
      let body: unknown;
      if (!response.invalidResponse) {
        try {
          body = JSON.parse(response.body);
        } catch {
          /* A missing acknowledgement must never become a fabricated success. */
        }
      }
      if (response.status === 201) {
        const parsed = UploadResponseSchema.safeParse(body);
        return parsed.success
          ? { status: 'uploaded', reportId: parsed.data.id }
          : { status: 'submission_unknown' };
      }
      if (response.status >= 400 && response.status < 600) {
        const parsed = ErrorResponseSchema.safeParse(body);
        // A replay may refer to a submission that already reached storage.
        if (parsed.success && parsed.data.error.code === 'replayed_request')
          return { status: 'submission_unknown' };
        const reason =
          parsed.success && Object.hasOwn(ERROR_REASONS, parsed.data.error.code)
            ? ERROR_REASONS[parsed.data.error.code]
            : undefined;
        if (reason) return { status: 'rejected', reason };
        if (response.status === 401 || response.status === 403)
          return { status: 'rejected', reason: 'authentication_failed' };
        if (response.status === 413) return { status: 'rejected', reason: 'archive_too_large' };
        if (response.status === 429) return { status: 'rejected', reason: 'rate_limited' };
        return {
          status: 'rejected',
          reason: response.status >= 500 ? 'service_unavailable' : 'submission_rejected',
        };
      }
      return { status: 'submission_unknown' };
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof Error && 'code' in error && error.code === 'ERR_UPLOAD_PREPARATION')
        return { status: 'rejected', reason: 'invalid_archive' };
      return { status: 'submission_unknown' };
    } finally {
      input.signal?.removeEventListener('abort', cancel);
    }
  }
}
