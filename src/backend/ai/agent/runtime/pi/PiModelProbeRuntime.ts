import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, MemoryStorage } from '@earendil-works/pi-durable';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { RuntimeEventChannel } from '../RuntimeEventChannel';
import type {
  AgentRuntime,
  AgentRuntimeSession,
  RuntimeExecutionRequest,
  RuntimeOutputPart,
} from '../types';
import { toPiConversation } from './modelMessages';
import { createPiDurableModels } from './piDurableModels';
import { PiDurableObserver } from './PiDurableObserver';
import { piSubmissionMetadata } from './piDurableProjection';
import { PiDurableRuntime } from './PiDurableRuntime';
import type { PiRuntimeDependencies } from './piModelTypes';

/** Provider health checks use the same upstream loop in isolated memory, never the production DB. */
export class PiModelProbeRuntime implements AgentRuntime {
  readonly descriptor = {
    id: 'pi-durable-probe',
    name: 'Pi Durable Model Probe',
    capabilities: { reasoning: true, tools: false, approvals: false, attachments: false },
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

  constructor(private readonly dependencies: PiRuntimeDependencies) {}

  execute(request: RuntimeExecutionRequest) {
    if (this.request || this.closing) throw new Error('A model probe admits one request only.');
    this.request = request;
    this.operation = this.run(request).catch((error: unknown) => {
      this.channel.push(
        this.controller.signal.aborted
          ? { type: 'cancelled' }
          : { type: 'failed', error: { ...normalizeAiError(error), origin: 'runtime' } },
      );
      this.channel.end();
    });
    return this.channel.drain();
  }

  private async run(request: RuntimeExecutionRequest) {
    if (
      request.tools.length ||
      request.history.length ||
      request.contextCheckpoint ||
      request.resume
    )
      throw new Error('Model probes accept a fresh input without history or capabilities.');
    const bridge = createPiDurableModels(
      {
        ...this.dependencies,
        resolveModel: (model, options, sessionId, _override, signal) =>
          this.dependencies.resolveModel(model, options, sessionId, request.apiKeyOverride, signal),
      },
      async () => request.options,
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
      registry: createRegistry(),
      settings: { extensions: [], retry: { maxRetries: 0 }, compaction: { enabled: false } },
    });
    this.controller.signal.throwIfAborted();
    await this.runtime.ensureConversation({
      sessionId: request.sessionId,
      metadata: {},
      options: request.options,
      agent: {
        model: { provider: request.model.providerId, modelId: request.model.modelId },
        instructions: request.instructions,
      },
    });
    const previous = new Map<string, RuntimeOutputPart>();
    this.observer = new PiDurableObserver(this.runtime, request.sessionId, null, (event) => {
      if (event.type !== 'turn.updated') return;
      for (const [index, part] of event.turn.parts.entries()) {
        const old = previous.get(part.id);
        if (!old) this.channel.push({ type: 'part.add', index, part });
        else if (JSON.stringify(old) !== JSON.stringify(part))
          this.channel.push({ type: 'part.replace', part });
        previous.set(part.id, part);
      }
      if (event.turn.status === 'running' || event.turn.status === 'queued') return;
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
      piSubmissionMetadata(input, []),
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
