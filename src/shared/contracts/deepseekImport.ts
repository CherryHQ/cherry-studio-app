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
  /** Conversations that could not be read or converted. */
  skippedConversations: number;
};

export type DeepseekImportErrorCode =
  | 'invalid'
  | 'unsupported'
  | 'empty'
  | 'too-large'
  | 'disk-space'
  | 'busy'
  | 'invalid-link'
  | 'share-link'
  | 'expired-link'
  | 'download'
  | 'failed';

export class DeepseekImportError extends Error {
  readonly reasonCode?: 'missing-directory' | 'malformed';

  constructor(
    readonly code: DeepseekImportErrorCode,
    options?: ErrorOptions & { reasonCode?: DeepseekImportError['reasonCode'] },
  ) {
    super(`DeepSeek import: ${code}`, options);
    this.name = 'DeepseekImportError';
    this.reasonCode = options?.reasonCode;
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
