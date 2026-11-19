import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import { SshError, type SshProfile, type SshReference } from '@/shared/data/types/ssh';

type Decision = 'restore' | 'forget' | 'cancel';
type RestorePrompt = {
  profile: SshProfile;
  canForget: boolean;
  decide: (decision: Decision) => void;
};

const cancelled = () =>
  Object.assign(new Error('SSH target confirmation cancelled'), { name: 'AbortError' });

export function useSshTargetRestore(sessionId: string | undefined, enabled: boolean) {
  const ssh = useBackendModule('ssh');
  const lifetime = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState<RestorePrompt>();

  useLayoutEffect(() => {
    if (!sessionId || !enabled) return;
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      lifetime.current = null;
      controller.abort();
    };
  }, [enabled, sessionId]);

  const prepare = useCallback(
    (mentions: readonly SshReference[]) => {
      if (!sessionId || !enabled || ssh.getTarget(sessionId)) return;
      const signal = lifetime.current?.signal;
      if (!signal) throw cancelled();
      return ssh.getRememberedTarget(sessionId).then(async (profile) => {
        if (signal.aborted) throw cancelled();
        if (!profile) return;
        if (mentions.some(({ id, revision }) => id !== profile.id || revision !== profile.revision))
          throw new SshError('changed');

        const { promise, resolve } = Promise.withResolvers<Decision>();
        const cancel = () => resolve('cancel');
        const request = { profile, canForget: mentions.length === 0, decide: resolve };
        signal.addEventListener('abort', cancel, { once: true });
        setPrompt(request);
        const decision = await promise;
        signal.removeEventListener('abort', cancel);
        setPrompt((current) => (current === request ? undefined : current));
        if (decision === 'cancel' || signal.aborted) throw cancelled();
        await ssh.decideRememberedTarget(sessionId, profile, decision);
        if (signal.aborted) throw cancelled();
      });
    },
    [enabled, sessionId, ssh],
  );

  return { prepare, prompt };
}
