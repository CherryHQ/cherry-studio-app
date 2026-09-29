import type { AiFailureSnapshot } from '@cherrystudio/remote-protocol/failure';

export {
  aiFailureReasonSchema as AiFailureReasonSchema,
  aiFailureSnapshotSchema as AiFailureSnapshotSchema,
} from '@cherrystudio/remote-protocol/failure';
export type {
  AiFailureReason,
  AiFailureSnapshot,
  ExecutionFailure,
} from '@cherrystudio/remote-protocol/failure';

/** Credential-free diagnostic facts shared by request and execution adapters. */
export type AiFailureInput = {
  code: string;
  message: string;
  retryable: boolean;
  origin?: AiFailureSnapshot['source']['layer'];
  name?: string;
  context?: AiFailureSnapshot['context'];
};
/** Expected request failure carried across AI capability boundaries. */
export class AiRequestError extends Error {
  constructor(
    readonly detail: { message: string; retryable: boolean; failure: AiFailureSnapshot },
  ) {
    super(detail.message);
    this.name = 'AiRequestError';
  }
}
