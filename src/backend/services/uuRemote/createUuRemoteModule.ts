import { randomUUID } from 'expo-crypto';
import { Linking, Platform } from 'react-native';

import { nativeCallbackUrl } from '@/backend/utils/oauth';
import {
  UuRemoteError,
  type UuRemoteFailure,
  type UuRemoteModule,
  type UuRemoteResult,
  type UuRemoteTarget,
  type UuRemoteWindowMode,
} from '@/shared/contracts/uuRemote';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { uuRemoteStorage, type UuRemotePending, type UuRemoteStorage } from './uuRemoteStorage';

// UU can wait for login and for the user to dismiss a failure dialog. Do not time out the UI
// at the transport's 30-second deadline; this only bounds acceptance of a delayed callback.
const CALLBACK_LIFETIME_MS = 30 * 60 * 1000;
const CALLBACK_PATH = 'uu-remote/callback';

type Dependencies = {
  connectionExists(connectionId: string): Promise<boolean>;
  storage?: UuRemoteStorage;
};

export function createUuRemoteModule({
  connectionExists,
  storage = uuRemoteStorage,
}: Dependencies): { module: UuRemoteModule; dispose(): Promise<void> } {
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();

  function assertActive() {
    if (disposed) throw new UuRemoteError('failed');
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(() => {
      assertActive();
      return operation();
    });
    queue = next.catch(() => undefined);
    return next;
  }

  async function assertAvailable(target: UuRemoteTarget) {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new UuRemoteError('failed');
    if (!(await connectionExists(target.connectionId))) throw new UuRemoteError('binding-invalid');
    let installed: boolean;
    try {
      installed = await Linking.canOpenURL('uuremote://external');
    } catch {
      throw new UuRemoteError('failed');
    }
    if (!installed) throw new UuRemoteError('not-installed');
    assertActive();
  }

  async function launch(target: UuRemoteTarget, deviceId: string | null, mode: UuRemoteWindowMode) {
    const url = new URL(`uuremote://external/device/${deviceId ? 'control' : 'authorize'}`);
    if (deviceId) {
      url.searchParams.set('anonymous_device_id', deviceId);
      url.searchParams.set('window_type', mode === 'pip' ? '1' : '0');
    }
    let pending: UuRemotePending | null = null;
    if (!deviceId || mode === 'pip') {
      const callbackBase = nativeCallbackUrl(CALLBACK_PATH);
      if (!callbackBase) throw new UuRemoteError('failed');
      const nonce = randomUUID();
      const callback = new URL(callbackBase);
      callback.searchParams.set('request_id', nonce);
      url.searchParams.set('callback', callback.toString());
      if (!deviceId) url.searchParams.set('nonce', nonce);
      pending = {
        kind: deviceId ? 'control' : 'bind',
        mode,
        nonce,
        target,
        createdAt: Date.now(),
      };
    }
    // Fullscreen never calls back. Retire any prior handoff before opening it.
    assertActive();
    await storage.writePending(pending);
    try {
      assertActive();
      await Linking.openURL(url.toString());
    } catch {
      await storage.writePending(null);
      throw new UuRemoteError('failed');
    }
  }

  return {
    module: {
      getBinding: (connectionId) =>
        serialize(async () => {
          const deviceId = await storage.readBinding(connectionId);
          return deviceId ? { displayId: sha256HexOfText(deviceId).slice(0, 8) } : null;
        }),
      open: (target, mode = 'pip') =>
        serialize<'opened' | 'binding-required'>(async () => {
          await assertAvailable(target);
          if (
            mode === 'pip' &&
            Platform.OS === 'ios' &&
            Number.parseInt(String(Platform.Version), 10) < 18
          ) {
            throw new UuRemoteError('pip-unsupported');
          }
          const deviceId = await storage.readBinding(target.connectionId);
          if (!deviceId) return 'binding-required';
          await launch(target, deviceId, mode);
          return 'opened';
        }),
      bind: (target, mode = 'pip') =>
        serialize(async () => {
          await assertAvailable(target);
          await launch(target, null, mode);
        }),
      receiveCallback: (rawUrl) =>
        serialize(async () => {
          const callbackBase = nativeCallbackUrl(CALLBACK_PATH);
          if (!callbackBase) return null;
          let url: URL;
          try {
            url = new URL(rawUrl);
          } catch {
            return null;
          }
          const expected = new URL(callbackBase);
          if (
            url.protocol !== expected.protocol ||
            url.host !== expected.host ||
            url.pathname !== expected.pathname ||
            url.username ||
            url.password ||
            url.hash
          )
            return null;
          const pending = await storage.readPending();
          if (!pending || singleParam(url, 'request_id') !== pending.nonce) return null;
          if (pending.kind === 'bind' && singleParam(url, 'nonce') !== pending.nonce) return null;

          // Consume once before applying the result. Stale, replayed and cross-device callbacks
          // cannot change a binding or launch another remote session.
          await storage.writePending(null);
          assertActive();
          if (
            Date.now() - pending.createdAt > CALLBACK_LIFETIME_MS ||
            pending.createdAt > Date.now()
          ) {
            return { target: pending.target, outcome: 'failed', reason: 'timeout' };
          }
          if (!(await connectionExists(pending.target.connectionId))) return null;
          assertActive();
          const result = parseResult(url, pending);
          if (result.outcome === 'bound') {
            await storage.writeBinding(
              pending.target.connectionId,
              singleParam(url, 'anonymous_device_id')!,
            );
          } else if (result.outcome === 'failed' && result.reason === 'binding-invalid') {
            await storage.writeBinding(pending.target.connectionId, null);
          }
          return result;
        }),
    },
    async dispose() {
      disposed = true;
      await queue;
    },
  };
}

function singleParam(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function parseResult(url: URL, pending: UuRemotePending): UuRemoteResult {
  const target = pending.target;
  if (pending.kind === 'bind') {
    const deviceId = singleParam(url, 'anonymous_device_id');
    const error = singleParam(url, 'error');
    if (deviceId && deviceId.length <= 8192 && !url.searchParams.has('error')) {
      return { target, outcome: 'bound', mode: pending.mode };
    }
    if (error && !url.searchParams.has('anonymous_device_id')) return failureResult(target, error);
  } else {
    const status = singleParam(url, 'status');
    if (status === 'success' && !url.searchParams.has('reason'))
      return { target, outcome: 'opened' };
    if (status === 'failure') return failureResult(target, singleParam(url, 'reason') ?? '');
  }
  return { target, outcome: 'failed', reason: 'failed' };
}

function failureResult(target: UuRemoteTarget, reason: string): UuRemoteResult {
  if (reason === 'user_cancel' || reason === 'superseded') return { target, outcome: 'cancelled' };
  const failures: Record<string, UuRemoteFailure> = {
    pip_unsupported: 'pip-unsupported',
    device_offline: 'device-offline',
    device_not_found: 'binding-invalid',
    no_device: 'no-device',
    busy: 'busy',
    not_allowed: 'not-allowed',
    network_unavailable: 'network',
    timeout: 'timeout',
    connect_timeout: 'timeout',
    login_timeout: 'login',
    not_logined: 'login',
    logout: 'login',
  };
  return {
    target,
    outcome: 'failed',
    reason: Object.hasOwn(failures, reason) ? failures[reason] : 'failed',
  };
}
