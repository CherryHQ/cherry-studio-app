import { v4 as uuid } from 'uuid';

import type { SystemAction, SystemEntryModule, SystemEntrySession } from '@/shared/contracts';
import type {
  AgentInputPart,
  AgentMessageView,
  AgentProtocol,
  AgentSessionView,
} from '@/shared/contracts/agent';

import {
  getSystemIntegration,
  nativeSystemEntrySchema,
  type NativeSystemEntry,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';

type Dependencies = {
  agent: Pick<AgentProtocol, 'startSession' | 'observeSession' | 'getSessionStatus' | 'cancelTurn'>;
  ensureReady(signal: AbortSignal): Promise<void>;
  listAgents(): Promise<readonly { id: string; name: string }[]>;
  getAgent(id: string): Promise<{ id: string; name: string }>;
  findSession(id: string): Promise<AgentSessionView | null>;
  readMessage(sessionId: string, messageId: string): Promise<AgentMessageView | null>;
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
  const publishAgents = native?.publishAgents?.bind(native);
  const sessions = new Map<string, SystemEntrySession>();
  const closing = new Set<Promise<void>>();
  let disposed = false;
  let sweep: Promise<void> | undefined;
  const cancelled = native?.addListener('onIntentCancelled', ({ id }) => {
    void sessions.get(id)?.dispose();
  });

  function createSession(entry: NativeSystemEntry): SystemEntrySession {
    let closed = false;
    let admitted = false;
    let admission: Promise<{ sessionId: string }> | undefined;
    let disposal: Promise<void> | undefined;
    let stopObservation: (() => void) | undefined;
    let replyTimer: ReturnType<typeof setTimeout> | undefined;
    let settle!: () => void;
    const assistantMessageId = uuid();
    const controller = new AbortController();
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const action: SystemAction =
      entry.kind === 'share.receive'
        ? {
            kind: entry.kind,
            text: entry.text ?? '',
            files: (entry.files ?? []).map(({ name, size, mediaType, uri }) => ({
              id: uri.slice(uri.lastIndexOf('/') + 1),
              name,
              size,
              mediaType,
            })),
          }
        : entry.kind === 'chat.ask'
          ? { kind: entry.kind, agentId: entry.agentId, text: entry.text! }
          : entry.kind === 'chat.open'
            ? { kind: entry.kind, agentId: entry.agentId }
            : { kind: 'painting.open' };

    function finish() {
      closed = true;
      controller.abort();
      stopObservation?.();
      stopObservation = undefined;
      if (replyTimer) clearTimeout(replyTimer);
      sessions.delete(entry.id);
      settle();
    }

    async function cancelOwnedTurn() {
      const status = dependencies.agent.getSessionStatus(entry.id);
      if (status && ['running', 'awaiting-approval', 'cancelling'].includes(status.status)) {
        await dependencies.agent.cancelTurn({ sessionId: entry.id, turnId: status.turnId });
      }
    }

    async function reply(status: 'succeeded' | 'failed', text?: string) {
      if (closed) return;
      finish();
      try {
        await native!.finishIntent(entry.id, { status, text });
        await native!.completeEntry(entry.id);
      } catch {
        /* No content or transport errors reach logging. The native deadline still settles its caller. */
      }
    }

    async function observeAnswer() {
      let answer = '';
      const readMessage = (message: AgentMessageView | null) => {
        if (message?.role === 'assistant')
          answer = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
      };
      const onStatus = (status: string) => {
        if (status === 'completed')
          void (async () => {
            if (!answer) readMessage(await dependencies.readMessage(entry.id, assistantMessageId));
            await reply(answer.trim() ? 'succeeded' : 'failed', answer.slice(0, 131_072));
          })().catch(() => reply('failed'));
        else if (['failed', 'cancelled', 'interrupted'].includes(status)) void reply('failed');
      };
      const observation = await dependencies.agent.observeSession(entry.id, (event) => {
        if (event.type === 'message.finalized') readMessage(event.message);
        if (event.type === 'turn.updated') onStatus(event.turn.status);
      });
      if (closed) {
        observation.unsubscribe();
        return;
      }
      stopObservation = observation.unsubscribe;
      readMessage(observation.snapshot.streamingMessage);
      if (observation.snapshot.activeTurn) onStatus(observation.snapshot.activeTurn.status);
      else {
        const status = dependencies.agent.getSessionStatus(entry.id);
        if (status) onStatus(status.status);
      }
      if (!closed)
        replyTimer = setTimeout(() => {
          void cancelOwnedTurn()
            .catch(() => {})
            .then(() => reply('failed'));
        }, 50_000);
    }

    const session: SystemEntrySession = {
      action,
      settled,
      async resolveAgent() {
        if (entry.agentId) return (await dependencies.getAgent(entry.agentId)).id;
        return (await dependencies.listAgents())[0]?.id ?? null;
      },
      submit(agentId) {
        if (admission) return admission;
        if (closed || !['share.receive', 'chat.ask'].includes(entry.kind))
          return Promise.reject(new Error('System entry is not available for submission'));
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
              if (entry.text?.trim()) parts.push({ type: 'text', text: entry.text });
              if (entry.kind === 'share.receive')
                parts.push(...(await dependencies.imports.import(entry, controller.signal)));
              controller.signal.throwIfAborted();
              await dependencies.agent.startSession(
                {
                  agentId,
                  sessionId: entry.id,
                  userMessageId: uuid(),
                  assistantMessageId,
                  executionTarget: { kind: 'local' },
                  parts,
                },
                { signal: controller.signal },
              );
              admitted = true;
            }
            if (closed) {
              if (entry.kind === 'chat.ask') await cancelOwnedTurn();
              return { sessionId: entry.id };
            }
            if (entry.kind === 'chat.ask') {
              void observeAnswer().catch(() => reply('failed'));
            } else {
              // Ack follows admission. A lost acknowledgement opens the same session on the next attempt.
              await native!.completeEntry(entry.id);
              dependencies.imports.forget(entry.id);
              finish();
            }
            return { sessionId: entry.id };
          } catch {
            if (!admitted) {
              // Admission may commit before an exception reaches this owner; retain uncertain files for recovery.
              const committed = await dependencies.findSession(entry.id).catch(() => undefined);
              if (committed) admitted = true;
              else if (committed === null && entry.kind === 'share.receive')
                await dependencies.imports.discard(entry.id);
            }
            if (entry.kind === 'chat.ask') await reply('failed');
            else if (!closed) admission = undefined;
            throw new Error('System entry submission failed');
          }
        })();
        return admission;
      },
      async complete() {
        if (closed) return;
        await native!.completeEntry(entry.id);
        finish();
      },
      async dismiss() {
        if (closed) return;
        if (entry.kind === 'chat.ask') {
          await session.dispose();
          return;
        }
        if (admission) await admission.catch(() => {});
        if (closed) return;
        if (entry.kind === 'share.receive') await dependencies.imports.discard(entry.id);
        await session.complete();
      },
      dispose() {
        if (disposal) return disposal;
        if (closed) return Promise.resolve();
        finish();
        disposal = (async () => {
          if (admission) await admission.catch(() => {});
          if (entry.kind === 'chat.ask') {
            await cancelOwnedTurn().catch(() => {});
            await native!.finishIntent(entry.id, { status: 'failed' }).catch(() => {});
            await native!.completeEntry(entry.id).catch(() => {});
          } else await native!.releaseEntry(entry.id).catch(() => {});
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
      refreshShortcuts: publishAgents
        ? async () => {
            if (disposed) return;
            await publishAgents(
              (await dependencies.listAgents()).map(({ id, name }) => ({ id, name })),
            );
          }
        : undefined,
    },
    async dispose() {
      disposed = true;
      cancelled?.remove();
      await Promise.allSettled([...sessions.values()].map((session) => session.dispose()));
      await Promise.allSettled([...closing]);
    },
  };
}
