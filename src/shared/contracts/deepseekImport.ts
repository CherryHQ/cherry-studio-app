export type DeepseekImportProgress =
  | {
      phase: 'downloading';
      completed: number;
      total: number | null;
    }
  | {
      phase: 'reading' | 'importing';
      completed: number;
      total: number;
    };

export type DeepseekImportResult = {
  agentId: string;
  sessions: number;
  messages: number;
  missingAttachments: number;
};

export type DeepseekImportErrorCode =
  | 'invalid'
  | 'unsupported'
  | 'empty'
  | 'too-large'
  | 'disk-space'
  | 'busy'
  | 'invalid-link'
  | 'expired-link'
  | 'download'
  | 'failed';

export class DeepseekImportError extends Error {
  constructor(
    readonly code: DeepseekImportErrorCode,
    options?: ErrorOptions,
  ) {
    super(`DeepSeek import: ${code}`, options);
    this.name = 'DeepseekImportError';
  }
}

export interface DeepseekImportModule {
  importFromUrl(
    url: string,
    options: {
      signal: AbortSignal;
      onProgress(progress: DeepseekImportProgress): void;
    },
  ): Promise<DeepseekImportResult>;
}
