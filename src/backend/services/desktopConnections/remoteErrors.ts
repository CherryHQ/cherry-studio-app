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

/**
 * The request never produced a desktop verdict: the reply timed out, the record could not be
 * written, or the channel closed while it was in flight. The desktop may still have acted on it.
 */
export class RemoteTransportError extends Error {
  constructor(
    readonly kind: 'timeout' | 'send-failed' | 'closed',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteTransportError';
  }
}

export class DesktopUnreachableError extends Error {
  constructor(
    readonly attempts: string[],
    readonly reason:
      | 'unreachable'
      | 'no-location'
      | 'discovery-unavailable'
      | 'unsupported-version' = 'unreachable',
  ) {
    super(`Could not connect to the desktop (${attempts.join('; ') || 'no address'})`);
    this.name = 'DesktopUnreachableError';
  }
}
