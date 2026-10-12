import type { DiagnosticUploadFailureReason } from '@/shared/contracts/diagnostics';

export type CherryDiagnosticUploadResult =
  | { status: 'uploaded'; reportId: string }
  | { status: 'rejected'; reason: DiagnosticUploadFailureReason }
  | { status: 'submission_unknown' };

export class CherryDiagnosticUploadClient {
  readonly isAvailable = false;

  async upload(input: {
    description: string;
    fileName: string;
    filePath: string;
    signal?: AbortSignal;
  }): Promise<CherryDiagnosticUploadResult> {
    input.signal?.throwIfAborted();
    // Connect the updated cloud service here once its mobile contract is available.
    return { status: 'rejected', reason: 'not_configured' };
  }
}
