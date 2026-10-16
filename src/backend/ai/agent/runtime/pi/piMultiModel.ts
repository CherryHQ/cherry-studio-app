import type { Context } from '@earendil-works/chord';
import type { Message, Model, Api, TSchema } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import {
  defineDocFamily,
  defineTask,
  defineTool,
  type EntryId,
  type JsonObject,
  type TaskId,
  type ToolExecutionApi,
} from '@earendil-works/pi-durable';

import {
  AgentMultiModelResultSchema,
  MULTI_MODEL_TOOL_NAME,
  type AgentMultiModelCandidate,
  type AgentMultiModelResult,
} from '@/shared/contracts/agent';

import type { RuntimeExecutionIdentity } from '../durableTypes';
import type { RuntimeModel } from '../types';
import { detachedJson } from './piDurableProjection';
import { emptyAssistantMessage } from './piStreamEvents';

type CandidateInput = {
  sessionId: string;
  owner: RuntimeExecutionIdentity;
  providerSessionId: string;
  groupKey: string;
  callId: string;
  anchor: EntryId;
  candidate: AgentMultiModelCandidate;
  model: RuntimeModel;
};
type CandidateState = { phase: 'request'; started: boolean; candidate: AgentMultiModelCandidate };

export const MultiModelGroup = defineDocFamily<{ value: JsonObject; tasks: number[] }, JsonObject>({
  kind: 'cherry.multi-model-group',
  version: 1,
  scope: 'session',
  family: true,
  initial: (value) => ({ value, tasks: [] }),
});

export function multiModelOutput(result: AgentMultiModelResult) {
  return {
    value: result,
    modelValue: {
      kind: result.kind,
      candidates: result.candidates.map(({ id, modelId, name, status }) => ({
        id,
        modelId,
        name,
        status,
      })),
    },
    artifacts: [],
  };
}

function details(result: AgentMultiModelResult) {
  return detachedJson({
    kind: 'cherry.tool-result',
    ref: { source: 'builtin', capabilityId: MULTI_MODEL_TOOL_NAME },
    providerName: MULTI_MODEL_TOOL_NAME,
    displayName: 'Multi-model reply',
    output: multiModelOutput(result),
  });
}

/** One registered task definition; ownership and model attribution travel with each durable input. */
export function createMultiModelCandidateTask(options: {
  stream(
    input: CandidateInput,
    messages: Message[],
    signal: AbortSignal,
  ): AssistantMessageEventStream;
}) {
  return defineTask<CandidateInput, CandidateState, AgentMultiModelCandidate>({
    name: 'cherry.multi-model-candidate',
    version: 1,
    initial: ({ candidate }) => ({ phase: 'request', started: false, candidate }),
    phases: {
      async request(task, runtime, context) {
        let candidate = { ...task.state.checkpoint.candidate };
        async function save(terminal: boolean) {
          await runtime.commit(async (tx) => {
            const group = await tx.doc(MultiModelGroup, task.input.groupKey, {});
            const result = AgentMultiModelResultSchema.parse(group.value);
            result.candidates = result.candidates.map((item) =>
              item.id === candidate.id ? candidate : item,
            );
            group.value = detachedJson(result);
            return terminal
              ? { status: 'terminal', outcome: { status: 'completed', result: candidate } }
              : { status: 'running', checkpoint: { phase: 'request', started: true, candidate } };
          }, context);
        }
        // The intent survives recovery. Never automatically repeat a potentially billed request.
        if (task.state.checkpoint.started) {
          if (candidate.status === 'queued' || candidate.status === 'running')
            candidate.status = 'interrupted';
          await save(true);
          return;
        }
        candidate.status = 'running';
        await save(false);
        try {
          const view = await runtime.context(runtime.conversationId, context, {
            at: task.input.anchor,
          });
          const call = view.messages.findIndex(
            (message) =>
              message.role === 'assistant' &&
              message.content.some(
                (part) => part.type === 'toolCall' && part.id === task.input.callId,
              ),
          );
          if (call < 0) throw new Error('The frozen multi-model input is unavailable.');
          const messages = view.messages.slice(0, call).map((message): Message => {
            if (message.role !== 'system') return message;
            const { toolsAdded: _added, toolsRemoved: _removed, ...instructions } = message;
            return instructions;
          });
          let lastSavedAt = Date.now();
          for await (const event of options.stream(task.input, messages, runtime.signal)) {
            if (event.type === 'text_delta') candidate.text += event.delta;
            if (event.type === 'thinking_delta') candidate.reasoning += event.delta;
            if (event.type === 'done' || event.type === 'error') {
              const message = event.type === 'done' ? event.message : event.error;
              candidate.text = message.content
                .flatMap((part) => (part.type === 'text' ? [part.text] : []))
                .join('');
              candidate.reasoning = message.content
                .flatMap((part) => (part.type === 'thinking' ? [part.thinking] : []))
                .join('');
              candidate.usage = {
                inputTokens:
                  message.usage.input + message.usage.cacheRead + message.usage.cacheWrite,
                outputTokens: message.usage.output,
                totalTokens: message.usage.totalTokens,
              };
              candidate.status = event.type === 'done' ? 'completed' : 'failed';
              if (event.type === 'error')
                candidate.error = {
                  code: 'EXECUTION_FAILED',
                  message: message.errorMessage ?? 'The candidate request failed.',
                  retryable: true,
                };
              await save(true);
              return;
            }
            if (Date.now() - lastSavedAt >= 100) {
              await save(false);
              lastSavedAt = Date.now();
            }
          }
          if (candidate.status === 'running') candidate.status = 'interrupted';
          await save(true);
        } catch (error) {
          runtime.signal.throwIfAborted();
          candidate.status = 'failed';
          // Provider diagnostics are redacted by the shared stream adapter; do not persist arbitrary exceptions.
          candidate.error = {
            code: 'EXECUTION_FAILED',
            message: 'The candidate request could not complete.',
            retryable: true,
          };
          runtime.report(error);
          await save(true);
        }
      },
    },
    async abort(task, runtime, context) {
      const candidate = { ...task.state.checkpoint.candidate, status: 'cancelled' as const };
      await runtime.commit(async (tx) => {
        const group = await tx.doc(MultiModelGroup, task.input.groupKey, {});
        const result = AgentMultiModelResultSchema.parse(group.value);
        result.candidates = result.candidates.map((item) =>
          item.id === candidate.id ? candidate : item,
        );
        group.value = detachedJson(result);
        return { status: 'terminal', outcome: { status: 'aborted', result: candidate } };
      }, context);
    },
  });
}

export function createMultiModelTool(options: {
  task: ReturnType<typeof createMultiModelCandidateTask>;
  targets: readonly { model: RuntimeModel; candidate: AgentMultiModelCandidate }[];
  input(
    api: ToolExecutionApi,
    context: Context,
  ): Promise<Pick<CandidateInput, 'owner' | 'anchor' | 'providerSessionId' | 'sessionId'>>;
}) {
  return defineTool({
    name: MULTI_MODEL_TOOL_NAME,
    description: 'Generate independent replies with the models selected by the user.',
    parameters: { type: 'object', properties: {}, additionalProperties: false } as TSchema,
    // Only child IDs are replayed. Each child's durable intent prevents an automatic second request.
    replay: 'safe',
    async execute(_args, api, context) {
      const input = await options.input(api, context);
      const groupKey = `${api.conversationId}:${api.callId}`;
      const initial = detachedJson({
        kind: 'multi-model-reply',
        version: 1,
        candidates: options.targets.map((target) => target.candidate),
      });
      const ids = await api.commit(async (tx) => {
        const group = await tx.doc(MultiModelGroup, groupKey, initial);
        if (!group.tasks.length) {
          for (const target of options.targets)
            group.tasks.push(
              await tx.createTask(
                options.task,
                {
                  ...input,
                  groupKey,
                  callId: api.callId,
                  ...target,
                },
                { ownership: { kind: 'task', taskId: api.taskId } },
              ),
            );
        }
        return [...group.tasks] as TaskId<AgentMultiModelCandidate>[];
      }, context);
      const watch = await api.watchDoc(MultiModelGroup, groupKey, context);
      if (!watch?.value) throw new Error('The multi-model group is unavailable.');
      await api.details(details(AgentMultiModelResultSchema.parse(watch.value.value)), context);
      watch.start(async (value) => {
        if (value)
          await api.details(details(AgentMultiModelResultSchema.parse(value.value)), context);
      });
      try {
        const outcomes = await Promise.allSettled(ids.map((id) => api.waitForTask(id, context)));
        context.abortSignal?.throwIfAborted();
        const stored = await api.snapshot(MultiModelGroup, groupKey, context);
        const result = AgentMultiModelResultSchema.parse(stored?.value);
        result.candidates = result.candidates.map((candidate, index) => {
          const outcome = outcomes[index];
          if (outcome.status === 'fulfilled' && outcome.value.state.outcome.result)
            return outcome.value.state.outcome.result;
          return ['queued', 'running'].includes(candidate.status)
            ? { ...candidate, status: 'interrupted' as const }
            : candidate;
        });
        await api.commit(async (tx) => {
          const group = await tx.doc(MultiModelGroup, groupKey, initial);
          group.value = detachedJson(result);
        }, context);
        const output = multiModelOutput(result);
        return {
          content: [{ type: 'text', text: JSON.stringify(output.modelValue) }],
          details: details(result),
        };
      } finally {
        await watch.stop();
      }
    },
  });
}

/** App-directed scheduling: no main-model request before or after the candidate calls. */
export function multiModelStream(model: Model<Api>, messages: readonly Message[]) {
  const stream = new AssistantMessageEventStream();
  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  const done = messages
    .slice(lastUser + 1)
    .some((message) => message.role === 'toolResult' && message.toolName === MULTI_MODEL_TOOL_NAME);
  const message = {
    ...emptyAssistantMessage(model),
    stopReason: done ? ('stop' as const) : ('toolUse' as const),
    content: done
      ? []
      : [
          {
            type: 'toolCall' as const,
            id: globalThis.crypto.randomUUID(),
            name: MULTI_MODEL_TOOL_NAME,
            arguments: {},
          },
        ],
  };
  stream.push({ type: 'start', partial: message });
  stream.push({ type: 'done', reason: message.stopReason, message });
  stream.end(message);
  return stream;
}
