/** The Cherry surface to return to; never includes UU credentials or a caller-supplied URL. */
export type UuRemoteTarget =
  | {
      page: 'chat';
      connectionId: string;
      agentId?: string;
      sessionId?: string;
      draftId?: string;
    }
  | { page: 'device'; connectionId: string };

export type UuRemoteFailure =
  | 'not-installed'
  | 'pip-unsupported'
  | 'device-offline'
  | 'binding-invalid'
  | 'no-device'
  | 'busy'
  | 'not-allowed'
  | 'network'
  | 'timeout'
  | 'login'
  | 'failed';

export class UuRemoteError extends Error {
  constructor(readonly reason: UuRemoteFailure) {
    super(`UU Remote: ${reason}`);
    this.name = 'UuRemoteError';
  }
}

export type UuRemoteResult = { target: UuRemoteTarget } & (
  | { outcome: 'bound' | 'opened' | 'cancelled' }
  | { outcome: 'failed'; reason: UuRemoteFailure }
);

export interface UuRemoteModule {
  /** Launches PiP for this Cherry desktop, or asks the UI to explain device association first. */
  open(target: UuRemoteTarget): Promise<'opened' | 'binding-required'>;
  /** The user must select the corresponding computer in UU; the protocol cannot verify its name. */
  bind(target: UuRemoteTarget): Promise<void>;
  receiveCallback(url: string): Promise<UuRemoteResult | null>;
}
