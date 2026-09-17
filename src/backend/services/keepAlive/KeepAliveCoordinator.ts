import { Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';

export type KeepAliveLease = {
  /** Optional admission gate: resolves on readiness or release, rejects on platform failure. */
  ready?: Promise<void>;
  /** Idempotent; the last release across all holders stops the platform mechanism. */
  release(): void;
};

/** Wait at the execution boundary without making cancellation wait for native startup. */
export async function waitForKeepAlive(
  lease: KeepAliveLease | undefined,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const ready = lease?.ready;
  if (!ready) return;
  let onAbort!: () => void;
  try {
    await new Promise<void>((resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      void ready.then(resolve, reject);
    });
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export type KeepAliveSource = {
  /**
   * Holds background execution for the caller. `onInterrupt` fires when the
   * platform denies or revokes execution before release; sources that cannot be revoked
   * never call it.
   */
  acquire(tag: string, onInterrupt?: (reason: Error) => void | Promise<void>): KeepAliveLease;
};

/**
 * The one execution-lease facade that business services depend on. Each
 * platform mechanism is a registered `KeepAliveSource`; the coordinator
 * selects one when it is constructed and otherwise carries no platform
 * behaviour, so consumers never learn which mechanism, if any, protects their
 * work. It carries no preference gate either: each consumer decides for itself
 * when staying alive is warranted.
 */
@Injectable('KeepAliveCoordinator')
@ServicePhase(Phase.PostReady)
@DependsOn(['AudioKeepAliveSource', 'AndroidBackgroundActivityRuntime'])
@AppStatePolicy('not-applicable')
export class KeepAliveCoordinator extends BaseService {
  private disposed = false;
  private readonly source: KeepAliveSource;

  constructor(audio: KeepAliveSource, androidForegroundService: KeepAliveSource) {
    super();
    this.source = selectSource({ android: androidForegroundService, ios: audio });
  }

  acquire(tag: string, onInterrupt?: (reason: Error) => void | Promise<void>): KeepAliveLease {
    if (this.disposed) return noOpLease;
    return this.source.acquire(tag, onInterrupt);
  }

  protected onStop(): void {
    this.disposed = true;
  }
}

/** Platforms without a mechanism degrade to a no-op source, as presenters do. */
function selectSource(sources: {
  android: KeepAliveSource;
  ios: KeepAliveSource;
}): KeepAliveSource {
  switch (Platform.OS) {
    case 'android':
      return sources.android;
    case 'ios':
      return sources.ios;
    default:
      return noOpSource;
  }
}

const noOpLease: KeepAliveLease = { release: () => {} };
const noOpSource: KeepAliveSource = { acquire: () => noOpLease };
