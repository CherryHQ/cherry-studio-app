import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, useQuery } from '@/frontend/data';
import { SshError, type SshErrorCode } from '@/shared/data/types/ssh';

const errorKeys = {
  unavailable: 'ssh.error.unavailable',
  'invalid-input': 'ssh.error.invalidInput',
  busy: 'ssh.error.busy',
  cancelled: 'ssh.error.cancelled',
  timeout: 'ssh.error.timeout',
  resolve: 'ssh.error.resolve',
  connection: 'ssh.error.connection',
  handshake: 'ssh.error.handshake',
  'host-key': 'ssh.error.hostKey',
  authentication: 'ssh.error.authentication',
  channel: 'ssh.error.command',
  command: 'ssh.error.command',
  changed: 'ssh.error.changed',
  credential: 'ssh.error.credential',
  storage: 'ssh.error.storage',
} as const satisfies Record<SshErrorCode, string>;

export function sshErrorLabel(error: unknown, t: TFunction): string {
  return t(errorKeys[error instanceof SshError ? error.code : 'connection']);
}
export function useSshProfiles() {
  return useQuery('/ssh-profiles');
}

/** React adapter for the host-owned, ephemeral target selection. */
export function useSshTarget(contextId: string | undefined) {
  const ssh = useBackendModule('ssh');
  return useSyncExternalStore(ssh.subscribeTargets, () =>
    contextId ? ssh.getTarget(contextId) : null,
  );
}

/** One owner for an in-place action, its cancellation and user-facing failures. */
export function useSshAction() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      setBusy(current.current !== null);
      return () => {
        mounted.current = false;
        current.current?.abort();
      };
    }, []),
  );
  async function run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (!mounted.current || current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    try {
      const result = await action(controller.signal);
      return mounted.current ? result : undefined;
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        toast.show({ label: sshErrorLabel(error, t), variant: 'danger' });
    } finally {
      current.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, run, cancel: () => current.current?.abort() };
}
