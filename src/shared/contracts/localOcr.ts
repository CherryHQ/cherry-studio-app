export type LocalOcrModelId = 'xiaomi' | 'ovis';
export type FileOcrEngine = 'system' | LocalOcrModelId;

export type LocalOcrModelState = {
  status: 'idle' | 'checking' | 'downloading' | 'paused' | 'verifying' | 'ready' | 'failed';
  receivedBytes: number;
  totalBytes: number;
  reason?: 'download' | 'verification' | 'storage' | 'unavailable';
};

export interface LocalOcrModule {
  /** Calls back immediately. Leaving settings only unsubscribes; it does not delete the model. */
  observe(model: LocalOcrModelId, observer: (state: LocalOcrModelState) => void): () => void;
  /** Downloads both model files and enables local recognition after successful verification. */
  download(model: LocalOcrModelId): Promise<void>;
  pause(model: LocalOcrModelId): Promise<void>;
  remove(model: LocalOcrModelId): Promise<void>;
}
