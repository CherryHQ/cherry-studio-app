import { v4 as uuid } from 'uuid';

import type { SystemAction, SystemEntryModule, SystemEntrySession } from '@/shared/contracts';
import type { AgentInputPart, AgentProtocol, AgentSessionView } from '@/shared/contracts/agent';

import {
  getSystemIntegration,
  nativeSystemEntrySchema,
  type NativeSystemEntry,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';

type Dependencies = {
  agent: Pick<AgentProtocol, 'startSession'>;
  ensureReady(signal: AbortSignal): Promise<void>;
  getAgent(id: string): Promise<{ id: string; name: string }>;
  findSession(id: string): Promise<AgentSessionView | null>;
  imports: {
    import(entry: NativeSystemEntry, signal: AbortSignal): Promise<AgentInputPart[]>;
    discard(id: string): Promise<void>;
    forget(id: string): void;
    cleanExpired(): Promise<void>;
  };
  native?: SystemIntegrationNativeModule | null;
};

export function createSystemEntryModule(dependencies: Dependencies): {
  module: SystemEntryModule;
  dispose(): Promise<void>;
} {
  const native = dependencies.native === undefined ? getSystemIntegration() : dependencies.native;
  const sessions = new Map<string, SystemEntrySession>();
  const closing = new Set<Promise<void>>();
  let disposed = false;
  let sweep: Promise<void> | undefined;

  function createSession(entry: NativeSystemEntry): SystemEntrySession {
    let closed = false;
    let admitted = false;
    let admission: Promise<{ sessionId: string }> | undefined;
    let disposal: Promise<void> | undefined;
    let settle!: () => void;
    const controller = new AbortController();
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const action: SystemAction = {
      kind: 'share.receive',
      text: entry.text,
      files: entry.files.map(({ name, size, mediaType, uri }) => ({
        id: uri.slice(uri.lastIndexOf('/') + 1),
        name,
        size,
        mediaType,
      })),
    };

    function finish() {
      if (closed) return;
      closed = true;
      controller.abort();
      sessions.delete(entry.id);
      settle();
    }

    const session: SystemEntrySession = {
      action,
      settled,
      submit(agentId) {
        if (admission) return admission;
        if (closed)
          return Promise.reject(new Error('System share is not available for submission'));
        admission = (async () => {
          try {
            await dependencies.ensureReady(controller.signal);
            await dependencies.getAgent(agentId);
            const existing = await dependencies.findSession(entry.id);
            controller.signal.throwIfAborted();
            if (existing) {
              admitted = true;
            } else {
              const parts: AgentInputPart[] = [];
              if (entry.text.trim()) parts.push({ type: 'text', text: entry.text });
              parts.push(...(await dependencies.imports.import(entry, controller.signal)));
              controller.signal.throwIfAborted();
              await dependencies.agent.startSession(
                {
                  agentId,
                  sessionId: entry.id,
                  userMessageId: uuid(),
                  assistantMessageId: uuid(),
                  executionTarget: { kind: 'local' },
                  parts,
                },
                { signal: controller.signal },
              );
              admitted = true;
            }
            if (closed) return { sessionId: entry.id };
            // Ack follows admission. A lost acknowledgement opens the same session on the next attempt.
            await native!.completeEntry(entry.id);
            dependencies.imports.forget(entry.id);
            finish();
            return { sessionId: entry.id };
          } catch {
            if (!admitted) {
              // Admission may commit before an exception reaches this owner; retain uncertain files for recovery.
              const committed = await dependencies.findSession(entry.id).catch(() => undefined);
              if (committed) admitted = true;
              else if (committed === null) await dependencies.imports.discard(entry.id);
            }
            if (!closed) admission = undefined;
            throw new Error('System share submission failed');
          }
        })();
        return admission;
      },
      async dismiss() {
        if (closed) return;
        if (admission) await admission.catch(() => {});
        if (closed) return;
        await dependencies.imports.discard(entry.id);
        await native!.completeEntry(entry.id);
        finish();
      },
      dispose() {
        if (disposal) return disposal;
        if (closed) return Promise.resolve();
        finish();
        disposal = (async () => {
          if (admission) await admission.catch(() => {});
          await native!.releaseEntry(entry.id).catch(() => {});
        })();
        closing.add(disposal);
        void disposal.finally(() => closing.delete(disposal!));
        return disposal;
      },
    };
    return session;
  }

  return {
    module: {
      subscribePending(listener) {
        const subscription = native?.addListener('onPending', listener);
        return () => subscription?.remove();
      },
      async claimNext() {
        if (!native || disposed) return null;
        sweep ??= dependencies.imports.cleanExpired().catch(() => {
          sweep = undefined;
        });
        await sweep;
        while (true) {
          const value = await native.claimNextEntry();
          if (!value) return null;
          const parsed = nativeSystemEntrySchema.safeParse(value);
          if (
            !parsed.success ||
            Date.now() - value.createdAt > 86_400_000 ||
            value.createdAt > Date.now() + 60_000
          ) {
            // The native store has already constrained file URIs to its private staging directory.
            // Dropping one invalid entry must not strand later valid shares until the next foreground.
            await native.completeEntry(value.id);
            continue;
          }
          if (disposed) {
            await native.releaseEntry(value.id);
            return null;
          }
          const session = createSession(parsed.data);
          sessions.set(value.id, session);
          return session;
        }
      },
    },
    async dispose() {
      disposed = true;
      await Promise.allSettled([...sessions.values()].map((session) => session.dispose()));
      await Promise.allSettled([...closing]);
    },
  };
}
