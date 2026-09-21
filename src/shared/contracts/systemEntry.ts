import type { FileEntryId } from '@/shared/data/types/file';

/** A shared attachment after it has been imported into the managed file library. */
export type SystemSharedFile = {
  fileEntryId: FileEntryId;
  mediaType: string;
  name: string;
  size: number;
  uri: string;
};

export type SystemAction = {
  kind: 'share.receive';
  text: string;
  files: readonly SystemSharedFile[];
};

export interface SystemEntryModule {
  subscribePending(listener: () => void): () => void;
  /**
   * Claims one staged share. Attachments are imported into the library and the native staging
   * copy is released before it resolves, so the caller owns nothing that needs releasing.
   */
  claimNext(): Promise<SystemAction | null>;
}
