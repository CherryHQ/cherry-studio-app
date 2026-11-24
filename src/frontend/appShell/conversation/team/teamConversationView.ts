import type {
  TeamConversation,
  TeamConversationState,
  TeamMessage,
} from '@/shared/contracts/teamAgent';
import type { CherryMessagePart } from '@/shared/data/types/message';

import type {
  Availability,
  ConversationAction,
  ConversationInteractionResponse,
  ConversationMessage,
  ConversationSnapshot,
} from '../contracts';

/** Remote parts always cross the display-only tool boundary, including an empty tools array. */
export function createTeamConversationProjector(scope: string) {
  const cache = new WeakMap<TeamMessage, ConversationMessage>();
  const id = (value: string) => JSON.stringify([scope, value]);
  const message = (value: TeamMessage): ConversationMessage => {
    const old = cache.get(value);
    if (old) return old;
    const tools = value.tools.map((tool) => ({
      key: id(tool.id),
      title: tool.name,
      state: tool.state,
      input: {
        kind: 'inline' as const,
        value: { kind: 'json' as const, value: tool.input, complete: true as const },
      },
      ...(tool.output !== undefined
        ? {
            output: {
              kind: 'inline' as const,
              value: { kind: 'json' as const, value: tool.output, complete: true as const },
            },
          }
        : {}),
    }));
    const parts = value.parts.flatMap((part): CherryMessagePart[] => {
      if (part.type !== 'tool') return [{ type: part.type, text: part.text, state: part.state }];
      const tool = value.tools.find((item) => item.id === part.id);
      if (!tool) return [];
      const base = {
        type: 'dynamic-tool' as const,
        toolName: 'team_tool',
        toolCallId: id(tool.id),
        input: undefined,
      };
      return [
        tool.state === 'failed'
          ? { ...base, state: 'output-error', errorText: '' }
          : tool.state === 'completed'
            ? { ...base, state: 'output-available', output: undefined }
            : { ...base, state: 'input-available' },
      ];
    });
    const result: ConversationMessage = {
      key: id(value.id),
      state: value.status,
      completeness: value.status === 'streaming' ? 'partial' : 'complete',
      display: {
        id: id(value.id),
        role: value.role,
        createdAt: value.createdAt,
        usage: value.usage,
        status:
          value.status === 'streaming'
            ? 'pending'
            : value.status === 'cancelled' || value.status === 'interrupted'
              ? 'paused'
              : value.status,
        data: { parts, partKeys: value.parts.map((part) => id(part.id)) },
      },
      actions: {},
      tools,
    };
    cache.set(value, result);
    return result;
  };
  return (
    state: TeamConversationState,
    conversation: TeamConversation,
    agentId: string,
    title: string,
  ): ConversationSnapshot => {
    const view = state.view;
    const availability: Availability =
      state.phase === 'current'
        ? { state: 'enabled' }
        : { state: 'disabled', reason: 'synchronizing' };
    const action = <I>(execute: (input: I) => Promise<void>): ConversationAction<I, void> => ({
      availability,
      execute: async (input) => {
        try {
          await execute(input);
          return { state: 'applied', value: undefined };
        } catch {
          return {
            state: 'rejected',
            failure: { code: 'target-unavailable', retry: 'read-again' },
          };
        }
      },
    });
    return {
      title,
      agentId,
      isSubmitting: state.submitting,
      freshness:
        state.phase === 'retired'
          ? { state: 'retired' }
          : state.phase === 'loading'
            ? { state: 'loading' }
            : state.phase === 'error'
              ? { state: 'cached', reason: 'offline' }
              : { state: 'current' },
      liveMessages: view?.messages.map(message) ?? [],
      executions:
        view?.run && !['missing', 'unknown', 'busy'].includes(view.run.state)
          ? [
              {
                id: view.run.id,
                state:
                  view.run.state === 'running'
                    ? view.pending.length
                      ? view.pending[0].kind === 'approval'
                        ? 'awaiting-approval'
                        : 'awaiting-input'
                      : 'running'
                    : view.run.state === 'cancelled'
                      ? 'cancelled'
                      : view.run.state === 'failed'
                        ? 'failed'
                        : 'completed',
                ...(view.canStop ? { cancel: action(() => conversation.stop()) } : {}),
              },
            ]
          : [],
      interactions:
        view?.pending.map((pending) => ({
          id: pending.id,
          execution: pending.requestId,
          kind: pending.kind === 'approval' ? ('decision' as const) : ('question' as const),
          title: pending.text,
          state: 'pending' as const,
          input:
            pending.kind === 'approval'
              ? { kind: 'inline', value: { kind: 'json', value: pending.text, complete: true } }
              : {
                  kind: 'inline',
                  value: {
                    kind: 'question',
                    questions: [{ question: pending.text, multiple: false, options: [] }],
                  },
                },
          ...(view.canRespond
            ? {
                respond: action<ConversationInteractionResponse>((reply) => {
                  if (
                    pending.kind === 'approval' &&
                    (reply.kind === 'approve' || reply.kind === 'deny')
                  )
                    return conversation.respond(pending.id, pending.requestId, {
                      decision: reply.kind === 'approve' ? 'allow' : 'deny',
                    });
                  if (pending.kind === 'clarify' && reply.kind === 'answer')
                    return conversation.respond(pending.id, pending.requestId, {
                      text: Object.values(reply.answers)[0] ?? '',
                    });
                  return Promise.reject(new Error('Unsupported team interaction'));
                }),
              }
            : {}),
        })) ?? [],
    };
  };
}
