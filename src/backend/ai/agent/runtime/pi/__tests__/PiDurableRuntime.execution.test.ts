import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { getCurrentSystemPrompt } from '@earendil-works/pi-ai/utils/transcript';
import { createRegistry, MemoryStorage } from '@earendil-works/pi-durable';

import type { RuntimeEvent, RuntimeTool } from '../../types';
import { createPiDurableModels } from '../piDurableModels';
import { PiDurableRuntime } from '../PiDurableRuntime';
import { createPiDurableToolExtension } from '../piDurableTools';
import { PiModelProbeRuntime } from '../PiModelProbeRuntime';
import { emptyAssistantMessage } from '../piStreamEvents';

class ReopenableMemoryStorage extends MemoryStorage {
  override async close(): Promise<void> {}
}

const reference = { providerId: 'application-provider', modelId: 'configured-model' };
const wire: Model<Api> = {
  api: 'openai-responses',
  provider: reference.providerId,
  id: 'wire-model',
  name: 'Model',
  baseUrl: '',
  contextWindow: 32768,
  maxTokens: 4096,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

describe('Pi durable execution integration', () => {
  test('model probes deliver the answer and complete without storing a production conversation', async () => {
    const requests: TranscriptContext[] = [];
    const runtime = new PiModelProbeRuntime({
      preflightModel: async () => ({
        contextWindow: 32768,
        maxInputTokens: 28672,
        maxOutputTokens: 4096,
        inputModalities: ['text'],
        supportsTools: false,
      }),
      resolveModel: async () => ({
        model: wire,
        defaultThinkingLevel: 'off',
        redactionValues: [],
        supportsTools: false,
        usageContext: {
          providerId: reference.providerId,
          providerName: null,
          modelId: reference.modelId,
          modelName: null,
          pricingSnapshot: null,
          trustProviderReportedCost: false,
          reportedCostCurrency: null,
          credentialReceipt: { attribution: 'unknown' },
        },
        streamFn: (_model, context) => {
          requests.push(context);
          const stream = new AssistantMessageEventStream();
          stream.push({
            type: 'done',
            reason: 'stop',
            message: {
              ...emptyAssistantMessage(wire),
              stopReason: 'stop',
              content: [{ type: 'text', text: 'Probe answer' }],
            },
          });
          return stream;
        },
      }),
    });
    const session = await runtime.open();
    const events: RuntimeEvent[] = [];
    try {
      for await (const event of session.execute({
        sessionId: 'probe-session',
        turnId: 'probe-turn',
        model: reference,
        instructions: 'Answer the user.',
        input: [{ type: 'text', text: 'Hello' }],
        history: [],
        contextCheckpoint: null,
        tools: [],
        options: {},
      }))
        events.push(event);
      expect(events).toContainEqual({ type: 'completed' });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'part.add',
          part: expect.objectContaining({ type: 'text', text: 'Probe answer' }),
        }),
      );
      expect(requests).toHaveLength(1);
      expect(requests[0]?.messages.filter((message) => message.role === 'user')).toEqual([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
      ]);
    } finally {
      await session.close();
    }
  });

  test('Pi owns the model/tool loop and retained history across submissions and reopened owners', async () => {
    const storage = new ReopenableMemoryStorage();
    const requests: TranscriptContext[] = [];
    let runtime!: PiDurableRuntime;
    const bridge = createPiDurableModels(
      {
        preflightModel: async () => ({
          contextWindow: 32768,
          maxInputTokens: 28672,
          maxOutputTokens: 4096,
          inputModalities: ['text'],
          supportsTools: true,
        }),
        resolveModel: async () => ({
          model: wire,
          defaultThinkingLevel: 'off',
          redactionValues: [],
          supportsTools: true,
          usageContext: {
            providerId: reference.providerId,
            providerName: null,
            modelId: reference.modelId,
            modelName: null,
            pricingSnapshot: null,
            trustProviderReportedCost: false,
            reportedCostCurrency: null,
            credentialReceipt: { attribution: 'unknown' },
          },
          streamFn: (_model, context) => {
            requests.push(context);
            const message: AssistantMessage =
              requests.length === 1
                ? {
                    ...emptyAssistantMessage(wire),
                    stopReason: 'toolUse',
                    content: [
                      { type: 'toolCall', id: 'lookup-call', name: 'lookup', arguments: {} },
                    ],
                  }
                : {
                    ...emptyAssistantMessage(wire),
                    stopReason: 'stop',
                    content: [{ type: 'text', text: `Answer ${requests.length}` }],
                  };
            const stream = new AssistantMessageEventStream();
            stream.push({
              type: 'done',
              reason: message.stopReason as 'stop' | 'toolUse',
              message,
            });
            return stream;
          },
        }),
      },
      (affinity) => runtime.requestOptions(affinity),
    );
    await bridge.registerModel(reference);

    const instructionBody = 'Ask exactly one question, then wait for the user.';
    const execute = jest.fn(async () => ({
      value: { instructions: instructionBody },
      modelValue: 'Tool value',
      artifacts: [],
      instructions: { key: 'guide', text: instructionBody },
    }));
    const template: RuntimeTool = {
      ref: { source: 'builtin', capabilityId: 'lookup' },
      providerName: 'lookup',
      displayName: 'Lookup',
      description: 'Lookup a value.',
      inputSchema: { type: 'object', properties: {} },
      approval: 'auto',
      execute,
    };
    function registry() {
      const registry = createRegistry();
      const extension = createPiDurableToolExtension({
        name: 'capabilities',
        tools: [template],
        resolve: async (tool, api, context) => {
          const inputs = await runtime.inputsForTask(api, context);
          expect(inputs).toHaveLength(1);
          expect(inputs[0]?.metadata).toEqual({ turnId: 'first-turn' });
          return { tool, turnId: String(inputs[0]!.metadata!.turnId) };
        },
        approve: async () => true,
      });
      registry.install(extension);
      return { registry, extension };
    }
    const initial = registry();
    const settings = {
      followUpMode: 'one-at-a-time' as const,
      compaction: { enabled: false },
      retry: { enabled: false },
    };
    runtime = await PiDurableRuntime.open(storage, {
      models: bridge.models,
      registry: initial.registry,
      settings,
    });
    try {
      await runtime.ensureConversation({
        sessionId: 'business-session',
        revision: 0,
        options: { maxOutputTokens: 512 },
        agent: {
          model: { provider: reference.providerId, modelId: reference.modelId },
          instructions: 'Help the user.',
          extensions: [initial.extension],
        },
      });
      const first = await runtime.submit(
        'business-session',
        { type: 'input', requestId: 'first', content: 'First input' },
        { turnId: 'first-turn' },
      );
      expect((await first.wait(BACKGROUND_CONTEXT)).status).toBe('done');
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ turnId: 'first-turn', toolCallId: 'lookup-call' }),
      );
      expect(requests[1]?.messages).toContainEqual(
        expect.objectContaining({ role: 'toolResult', toolCallId: 'lookup-call' }),
      );
      expect(JSON.stringify(requests[1]?.messages)).toContain('Tool value');
      expect(getCurrentSystemPrompt(requests[1]!.messages)).toContain(instructionBody);
      expect(
        JSON.stringify(requests[1]?.messages.filter((message) => message.role === 'toolResult')),
      ).not.toContain(instructionBody);

      const second = await runtime.submit(
        'business-session',
        { type: 'input', requestId: 'second', content: 'Second input' },
        { turnId: 'second-turn' },
      );
      expect((await second.wait(BACKGROUND_CONTEXT)).status).toBe('done');
      expect(
        requests[2]?.messages
          .filter((message) => message.role === 'user')
          .map((message) => message.content),
      ).toEqual(['First input', 'Second input']);
      await runtime.close();

      // A new owner and reconstructed code reuse Pi history; no caller replays earlier turns.
      const recovered = registry();
      runtime = await PiDurableRuntime.open(storage, {
        models: bridge.models,
        registry: recovered.registry,
        settings,
      });
      const third = await runtime.submit(
        'business-session',
        { type: 'input', requestId: 'third', content: 'Third input' },
        { turnId: 'third-turn' },
      );
      expect((await third.wait(BACKGROUND_CONTEXT)).status).toBe('done');
      expect(
        requests[3]?.messages
          .filter((message) => message.role === 'user')
          .map((message) => message.content),
      ).toEqual(['First input', 'Second input', 'Third input']);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(getCurrentSystemPrompt(requests[3]!.messages)).toContain(instructionBody);

      // Discarding all tool history must not discard this execution's committed instructions.
      await runtime.reset('business-session');
      const recoveredBody = await runtime.submit(
        'business-session',
        { type: 'input', requestId: 'after-reset', content: 'Continue' },
        {},
      );
      expect((await recoveredBody.wait(BACKGROUND_CONTEXT)).status).toBe('done');
      expect(requests[4]!.messages.some((message) => message.role === 'toolResult')).toBe(false);
      expect(getCurrentSystemPrompt(requests[4]!.messages)).toContain(instructionBody);

      // The next Host configuration replaces the scope; disabled guides cannot leak through the doc.
      await runtime.configure(
        'business-session',
        {
          model: { provider: reference.providerId, modelId: reference.modelId },
          instructions: 'Help the user.',
          extensions: [recovered.extension],
        },
        { maxOutputTokens: 512 },
      );
      const next = await runtime.submit(
        'business-session',
        { type: 'input', requestId: 'new-scope', content: 'A new task' },
        {},
      );
      expect((await next.wait(BACKGROUND_CONTEXT)).status).toBe('done');
      expect(getCurrentSystemPrompt(requests[5]!.messages)).not.toContain(instructionBody);
    } finally {
      await runtime.close();
    }
  });
});
