import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import {
  type DiagnosticUploadFailureReason,
  normalizeDiagnosticDescription,
} from '@/shared/contracts/diagnostics';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';

export type CherryDiagnosticUploadResult =
  | { status: 'uploaded'; reportId: string }
  | { status: 'rejected'; reason: DiagnosticUploadFailureReason; fileSha256?: string }
  | { status: 'submission_unknown'; fileSha256: string };

export function diagnosticUploadFailure(
  status: number,
  body: string,
): DiagnosticUploadFailureReason {
  if (status === 400) {
    try {
      if (JSON.parse(body)?.code === 'invalid_diagnostic_archive') return 'invalid_archive';
    } catch {
      /* Rejected with an unreadable body. */
    }
  }
  if (status === 401 || status === 409) return 'authentication_failed';
  if (status === 413) return 'archive_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 502) return 'service_unavailable';
  return 'submission_rejected';
}

export async function createDiagnosticUploadHeaders(
  description: string,
  fileSha256: string,
  fileSize: number,
  sign: (value: string) => Promise<string>,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID().toLowerCase();
  const descriptionSha256 = await digestStringAsync(CryptoDigestAlgorithm.SHA256, description);
  const clientId = 'cherry-studio';
  const signature = await sign(
    [
      'v2',
      'POST',
      '/diagnostics',
      '',
      clientId,
      timestamp,
      requestId,
      fileSize.toString(),
      fileSha256,
      descriptionSha256,
    ].join('\n'),
  );
  return {
    'X-Signature-Version': '2',
    'X-Client-ID': clientId,
    'X-Timestamp': timestamp,
    'X-Request-ID': requestId,
    'X-File-Size': fileSize.toString(),
    'X-File-SHA256': fileSha256,
    'X-Description-SHA256': descriptionSha256,
    'X-Signature': signature,
  };
}

/** File-backed native transport replaces Electron net.fetch for this streaming upload. */
export class CherryDiagnosticUploadClient {
  async upload(input: {
    description: string;
    expectedFileSha256?: string;
    fileName: string;
    filePath: string;
    signal?: AbortSignal;
  }): Promise<CherryDiagnosticUploadResult> {
    const rejected = (
      reason: DiagnosticUploadFailureReason,
      fileSha256?: string,
    ): CherryDiagnosticUploadResult => ({ status: 'rejected', reason, fileSha256 });
    const file = new File(input.filePath);
    if (!input.fileName.toLowerCase().endsWith('.zip') || !file.exists || file.size <= 0)
      return rejected('invalid_archive');
    const size = file.size;
    const modifiedAt = file.modificationTime;
    if (size > 100 * 1024 * 1024) return rejected('archive_too_large');
    input.signal?.throwIfAborted();
    const native = getNativeDiagnostics();
    let fileSha256: string;
    try {
      fileSha256 = await native.sha256(file.uri);
    } catch {
      return rejected('invalid_archive');
    }
    if (input.expectedFileSha256 !== undefined && fileSha256 !== input.expectedFileSha256)
      return rejected('invalid_archive');
    const description = normalizeDiagnosticDescription(input.description);
    let headers: Record<string, string>;
    try {
      headers = await createDiagnosticUploadHeaders(description, fileSha256, size, (value) =>
        native.sign(value),
      );
    } catch {
      return rejected('authentication_failed', fileSha256);
    }
    if (!file.exists || file.size !== size || file.modificationTime !== modifiedAt)
      return rejected('invalid_archive');
    try {
      input.signal?.throwIfAborted();
      const response = await native.upload(file.uri, input.fileName, description, headers);
      if (response.status === 0) return { status: 'submission_unknown', fileSha256 };
      if (response.status >= 200 && response.status < 300) {
        if (!response.invalidResponse) {
          try {
            const value = JSON.parse(response.body);
            if (value && !Array.isArray(value) && typeof value.id === 'string' && value.id.trim())
              return { status: 'uploaded', reportId: value.id };
          } catch {
            /* Acknowledgement could not be read; the server may have accepted it. */
          }
        }
        return { status: 'submission_unknown', fileSha256 };
      }
      return rejected(
        diagnosticUploadFailure(response.status, response.invalidResponse ? '' : response.body),
        fileSha256,
      );
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ERR_UPLOAD_PREPARATION'
      )
        return rejected('invalid_archive', fileSha256);
      return { status: 'submission_unknown', fileSha256 };
    }
  }
}
