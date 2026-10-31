export type FileOcrEngine = 'system' | 'xiaomi';

export type LocalOcrModelState = {
  status: 'idle' | 'checking' | 'downloading' | 'paused' | 'verifying' | 'ready' | 'failed';
  receivedBytes: number;
  totalBytes: number;
  reason?: 'download' | 'verification' | 'storage' | 'unavailable';
};

export interface LocalOcrModule {
  /** Calls back immediately. Leaving settings only unsubscribes; it does not delete the model. */
  observe(observer: (state: LocalOcrModelState) => void): () => void;
  /** Downloads both model files and enables local recognition after successful verification. */
  download(): Promise<void>;
  pause(): Promise<void>;
  remove(): Promise<void>;
}
