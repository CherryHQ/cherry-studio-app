import type { RemoteFailure } from '@cherrystudio/remote-protocol';

/** A desktop-reported failure; `reason` is the protocol's stable code. */
export class RemoteFailureError extends Error {
  constructor(readonly failure: RemoteFailure) {
    super(failure.message);
    this.name = 'RemoteFailureError';
  }
  get reason() {
    return this.failure.reason;
  }
}

export class DesktopUnreachableError extends Error {
  constructor(readonly attempts: string[]) {
    super(`Could not connect to the desktop (${attempts.join('; ') || 'no address'})`);
    this.name = 'DesktopUnreachableError';
  }
}
