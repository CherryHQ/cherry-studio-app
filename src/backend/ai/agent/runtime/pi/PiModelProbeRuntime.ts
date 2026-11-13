import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, GenerationTask, hook, MemoryStorage } from '@earendil-works/pi-durable';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { runtimeLane } from '../durableTypes';
import { RuntimeEventChannel } from '../RuntimeEventChannel';
import {
  RUNTIME_EXECUTION_LIMIT_CODE,
  type AgentRuntime,
  type AgentRuntimeSession,
  type RuntimeError,
  type RuntimeExecutionRequest,
} from '../types';
import { toPiConversation } from './modelMessages';
import { cherryClientIdentity, createPiDurableModels } from './piDurableModels';
import { PiDurableObserver } from './PiDurableObserver';
import { piSubmissionMetadata } from './piDurableProjection';
import { PiDurableRuntime } from './PiDurableRuntime';
import { createPiDurableToolExtension } from './piDurableTools';
import type { PiRuntimeDependencies } from './piModelTypes';

/** Isolated checks use the upstream loop in memory, with only explicitly supplied read tools. */
export class PiModelProbeRuntime implements AgentRuntime {
  readonly descriptor = {
    id: 'pi-durable-probe',
    name: 'Pi Durable Model Probe',
    capabilities: { reasoning: true, tools: true, approvals: false, attachments: false },
  };
  constructor(private readonly dependencies: PiRuntimeDependencies) {}
  preflightModel(model: RuntimeExecutionRequest['model']) {
    return Promise.resolve(this.dependencies.preflightModel(model));
  }
  async open(): Promise<AgentRuntimeSession> {
    return new PiModelProbeSession(this.dependencies);
  }
}

class PiModelProbeSession implements AgentRuntimeSession {
  private readonly channel = new RuntimeEventChannel();
  private readonly controller = new AbortController();
  private runtime: PiDurableRuntime | undefined;
  private observer: PiDurableObserver | undefined;
  private request: RuntimeExecutionRequest | undefined;
  private operation: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private limitError: RuntimeError | undefined;

  constructor(private readonly dependencies: PiRuntimeDependencies) {}

  execute(request: RuntimeExecutionRequest) {
    if (this.request || this.closing) throw new Error('A model probe admits one request only.');
    this.request = request;
    this.operation = this.run(request).catch((error: unknown) => {
      this.channel.push(
        this.limitError
          ? { type: 'failed', error: this.limitError }
          : this.controller.signal.aborted
            ? { type: 'cancelled' }
            : { type: 'failed', error: { ...normalizeAiError(error), origin: 'runtime' } },
      );
      this.channel.end();
    });
    return this.channel.drain();
  }

  private async run(request: RuntimeExecutionRequest) {
    if (
      request.tools.some((tool) => tool.effect !== 'read' || tool.approval !== 'auto') ||
      request.history.length ||
      request.contextCheckpoint ||
      request.resume
    )
      throw new Error('Isolated checks accept fresh input and automatic read-only capabilities.');
    const limits = request.limits;
    if (
      limits &&
      (!Number.isSafeInteger(limits.modelCalls) ||
        limits.modelCalls < 1 ||
        !Number.isSafeInteger(limits.toolCalls) ||
        limits.toolCalls < 0)
    )
      throw new Error('Isolated execution limits must be nonnegative integers with a model call.');
    let modelCalls = 0;
    let toolCalls = 0;
    const exceedLimit = () => {
      this.limitError ??= {
        code: RUNTIME_EXECUTION_LIMIT_CODE,
        message: 'The isolated execution budget was exceeded.',
        retryable: false,
        origin: 'runtime',
      };
      return new Error(this.limitError.message);
    };
    const extension = createPiDurableToolExtension({
      name: `cherry.probe:${request.sessionId}`,
      tools: request.tools,
      resolve: async (tool) => {
        if (this.limitError) throw new Error(this.limitError.message);
        return { tool, turnId: request.turnId };
      },
      approve: async () => false,
    });
    const registry = createRegistry();
    const boundedExtension = {
      ...extension,
      hooks: [
        ...(extension.hooks ?? []),
        ...(limits
          ? [
              hook(GenerationTask, {
                afterResponse: (message) => {
                  // Hooks observe every call before validation; resolve also guards execution because
                  // the Harness reports hook exceptions rather than treating them as admission policy.
                  toolCalls += message.content.filter((part) => part.type === 'toolCall').length;
                  if (toolCalls > limits.toolCalls) exceedLimit();
                },
              }),
            ]
          : []),
      ],
    };
    registry.install(boundedExtension);
    const bridge = createPiDurableModels(
      {
        ...this.dependencies,
        resolveModel: (model, options, sessionId, _override, signal) =>
          this.dependencies.resolveModel(model, options, sessionId, request.apiKeyOverride, signal),
      },
      async () => {
        if (this.limitError) throw new Error(this.limitError.message);
        if (limits && ++modelCalls > limits.modelCalls) throw exceedLimit();
        return request.options;
      },
      async () => async (report) => {
        this.channel.push({ type: 'usage', ...report });
      },
    );
    await bridge.registerModel(request.model);
    this.controller.signal.throwIfAborted();
    const model = bridge.models.getModel(request.model.providerId, request.model.modelId);
    if (!model) throw new Error('The probe model is unavailable.');
    this.runtime = await PiDurableRuntime.open(new MemoryStorage(), {
      models: bridge.models,
      registry,
      settings: { extensions: [], retry: { maxRetries: 0 }, compaction: { enabled: false } },
      identity: cherryClientIdentity(),
    });
    this.controller.signal.throwIfAborted();
    await this.runtime.ensureConversation({
      sessionId: request.sessionId,
      revision: 0,
      options: request.options,
      agent: {
        model: { provider: request.model.providerId, modelId: request.model.modelId },
        instructions: request.instructions,
        extensions: [boundedExtension],
        // Let the request guard report its closed limit code before the native round ceiling.
        ...(limits ? { maxTurns: limits.modelCalls + 1 } : {}),
      },
    });
    this.observer = new PiDurableObserver(this.runtime, runtimeLane(request.sessionId), (event) => {
      if (event.type !== 'turn.updated') return;
      // Live parts change IDs on commit; probes publish only the terminal snapshot.
      if (event.turn.status === 'running' || event.turn.status === 'queued') return;
      if (this.limitError) {
        this.channel.push({ type: 'failed', error: this.limitError });
        this.channel.end();
        return;
      }
      for (const [index, part] of event.turn.parts.entries()) {
        this.channel.push({ type: 'part.add', index, part });
      }
      if (event.turn.status === 'completed') this.channel.push({ type: 'completed' });
      else if (event.turn.status === 'cancelled') this.channel.push({ type: 'cancelled' });
      else
        this.channel.push({
          type: 'failed',
          error: event.turn.error ?? {
            code: 'MODEL_PROBE_FAILED',
            message: 'The model probe ended without an answer.',
            retryable: false,
          },
        });
      this.channel.end();
    });
    await this.observer.start();
    this.controller.signal.throwIfAborted();
    const prompt = toPiConversation(request, model).prompt;
    const input = {
      requestId: request.turnId,
      turnId: request.turnId,
      userMessageId: `probe-user:${request.turnId}`,
      assistantMessageId: `probe-assistant:${request.turnId}`,
      createdAt: Date.now(),
      input: request.input,
      metadata: {},
    };
    const submission = await this.runtime.submit(
      request.sessionId,
      { type: 'input', requestId: request.turnId, content: prompt.content, whenBusy: 'reject' },
      piSubmissionMetadata(input, request.tools),
      { userMessageId: input.userMessageId, assistantMessageId: input.assistantMessageId },
    );
    if (this.controller.signal.aborted) await this.runtime.stop(request.sessionId);
    await submission.wait(BACKGROUND_CONTEXT);
  }

  async cancel(turnId: string) {
    if (this.request?.turnId !== turnId) return;
    this.controller.abort(new Error('The model probe was cancelled.'));
    if (this.runtime && (await this.runtime.conversation(this.request.sessionId)))
      await this.runtime.stop(this.request.sessionId);
  }
  async respondApproval(): Promise<void> {
    throw new Error('Model probes expose no approval-capable tools.');
  }
  close(): Promise<void> {
    return (this.closing ??= (async () => {
      this.controller.abort(new Error('The model probe is closing.'));
      await this.observer?.stop();
      await this.runtime?.close();
      await this.operation;
      // Creation can finish after close begins; its aborted check prevents admission.
      await this.observer?.stop();
      await this.runtime?.close();
      this.channel.end();
    })());
  }
}
