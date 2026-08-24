import type { AssistantMessage } from '@earendil-works/pi-ai';

import { collectStreamContract } from '@/backend/ai/__tests__/_harness/contracts';
import type { AiUsageCaptureContext } from '@/backend/data/services/AiUsageRecordService';
import type { CherryUIMessage } from '@/shared/data/types/message';

import { PiChatStreamAdapter } from '../PiChatStreamAdapter';

const mockAbort = jest.fn();
const mockPrompt = jest.fn();
const mockStreamSimple = jest.fn();
const mockUnsubscribe = jest.fn();
let mockAgentOptions: Record<string, unknown> | undefined;
let mockListener: ((event: Record<string, unknown>) => Promise<void> | void) | undefined;

jest.mock(
  '@earendil-works/pi-agent-core/agent',
  () => ({
    Agent: class MockPiAgent {
      constructor(options: Record<string, unknown>) {
        mockAgentOptions = options;
      }

      abort = mockAbort;
      prompt = mockPrompt;

      subscribe(listener: (event: Record<string, unknown>) => Promise<void> | void) {
        mockListener = listener;
        return mockUnsubscribe;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  '@earendil-works/pi-ai/api/openai-responses',
  () => ({ streamSimple: (...args: unknown[]) => mockStreamSimple(...args) }),
  { virtual: true },
);

describe('PiChatStreamAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentOptions = undefined;
    mockListener = undefined;
  });

  test('streams a text and reasoning turn through the AI SDK message contract', async () => {
    mockPrompt.mockImplementation(async () => emitSuccessfulTurn());
    const recordInvocation = jest.fn(async () => undefined);
    const controller = new AbortController();
    const adapter = new PiChatStreamAdapter({
      apiKey: 'rotated-key',
      baseUrl: 'https://responses.example/v1',
      contextWindow: 128_000,
      headers: { 'X-Required': 'cherry' },
      maxOutputTokens: 4_096,
      maxRetries: 2,
      messageId: 'assistant-message-2',
      modelId: 'reasoning-model',
      modelName: 'Reasoning Model',
      providerId: 'responses-provider',
      providerName: 'Responses Provider',
      sessionId: 'topic-2',
      system: 'Be precise.',
      temperature: 0.2,
      thinkingLevel: 'high',
      timeoutMs: 45_000,
      usageCapture: { context: usageContext(), recorder: { recordInvocation } },
    });

    const output = await collectStreamContract(adapter.stream(messages(), controller.signal));

    expect(output.finalMessage).toMatchObject({
      id: 'assistant-message-2',
      metadata: {
        completionTokens: 8,
        promptTokens: 12,
        thoughtsTokens: 5,
        totalTokens: 20,
      },
      parts: [
        expect.objectContaining({
          providerMetadata: expect.objectContaining({
            pi: { redacted: false, thinkingSignature: 'reasoning-signature-new' },
          }),
          state: 'done',
          text: 'Because it is correct.',
          type: 'reasoning',
        }),
        expect.objectContaining({
          providerMetadata: { pi: { textSignature: 'text-signature-new' } },
          state: 'done',
          text: 'Final answer.',
          type: 'text',
        }),
      ],
      role: 'assistant',
    });
    expect(output.chunks.at(0)).toEqual({ messageId: 'assistant-message-2', type: 'start' });
    expect(output.chunks.at(-1)).toEqual({ finishReason: 'stop', type: 'finish' });
    expect(recordInvocation).toHaveBeenCalledTimes(1);
    expect(recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          messageRef: { id: 'assistant-message-2', kind: 'chat' },
        }),
        modality: 'language',
        requestId: expect.stringMatching(/^pi:responses-provider:/),
        usage: {
          cacheReadTokens: 3,
          cacheWriteTokens: 2,
          inputTokens: 12,
          noCacheTokens: 7,
          outputTokens: 8,
          reasoningTokens: 5,
          totalTokens: 20,
        },
      }),
    );

    expect(mockAgentOptions).toMatchObject({
      initialState: {
        messages: [
          expect.objectContaining({ role: 'user', content: 'First question.' }),
          expect.objectContaining({
            role: 'assistant',
            content: [
              {
                redacted: true,
                thinking: 'Earlier reasoning.',
                thinkingSignature: 'reasoning-signature-old',
                type: 'thinking',
              },
              { text: 'Earlier answer.', textSignature: 'text-signature-old', type: 'text' },
            ],
          }),
        ],
        model: {
          api: 'openai-responses',
          baseUrl: 'https://responses.example/v1',
          contextWindow: 128_000,
          id: 'reasoning-model',
          maxTokens: 4_096,
          provider: 'responses-provider',
          reasoning: true,
        },
        systemPrompt: 'Be precise.',
        thinkingLevel: 'high',
      },
      sessionId: 'topic-2',
    });
    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Second question.', role: 'user' }),
    );

    const streamFn = mockAgentOptions?.streamFn as (
      model: unknown,
      context: unknown,
      options: Record<string, unknown>,
    ) => unknown;
    const piModel = (mockAgentOptions?.initialState as { model: unknown }).model;
    const piContext = { messages: [], systemPrompt: 'Be precise.' };
    const piSignal = new AbortController().signal;
    mockStreamSimple.mockReturnValue('pi-stream');

    expect(streamFn(piModel, piContext, { signal: piSignal })).toBe('pi-stream');
    expect(mockStreamSimple).toHaveBeenCalledWith(
      piModel,
      piContext,
      expect.objectContaining({
        apiKey: 'rotated-key',
        headers: { 'X-Required': 'cherry' },
        maxRetries: 2,
        maxTokens: 4_096,
        signal: piSignal,
        temperature: 0.2,
        timeoutMs: 45_000,
      }),
    );
  });

  test.each([
    {
      part: {
        filename: 'attachment.txt',
        mediaType: 'text/plain',
        type: 'file',
        url: 'file:///attachment.txt',
      },
      type: 'file',
    },
    {
      part: {
        input: { query: 'Cherry Studio' },
        state: 'input-available',
        toolCallId: 'tool-call-1',
        type: 'tool-search',
      },
      type: 'tool-search',
    },
  ])('rejects an unsupported $type part before starting Pi', ({ part, type }) => {
    const adapter = createAdapter();
    const unsupportedMessages = [
      {
        id: 'user-unsupported',
        parts: [{ text: 'Use this input.', type: 'text' }, part],
        role: 'user',
      },
    ] as CherryUIMessage[];

    expect(() => adapter.stream(unsupportedMessages, new AbortController().signal)).toThrow(
      `Pi chat runtime does not support message part: ${type}`,
    );
    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockAgentOptions).toBeUndefined();
  });

  test('surfaces a terminal provider error after preserving partial text and records usage once', async () => {
    let finishWithError!: () => void;
    const recordInvocation = jest.fn(async () => undefined);
    mockPrompt.mockImplementation(async () => {
      await mockListener?.(
        updateEvent('text_start', {
          content: [{ text: '', type: 'text' }],
        }),
      );
      await mockListener?.(
        updateEvent('text_delta', {
          content: [{ text: 'Partial answer.', type: 'text' }],
          delta: 'Partial answer.',
        }),
      );
      await new Promise<void>((resolve) => {
        finishWithError = resolve;
      });
      await mockListener?.({
        message: assistantMessage({ errorMessage: 'Provider unavailable', stopReason: 'error' }),
        toolResults: [],
        type: 'turn_end',
      });
    });
    const reader = createAdapter({
      usageCapture: { context: usageContext(), recorder: { recordInvocation } },
    })
      .stream(messages(), new AbortController().signal)
      .getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { messageId: 'assistant-message-2', type: 'start' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { id: 'pi-0', type: 'text-start' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { delta: 'Partial answer.', id: 'pi-0', type: 'text-delta' },
    });
    finishWithError();
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: { type: 'message-metadata' },
    });
    await expect(reader.read()).rejects.toThrow('Provider unavailable');
    expect(recordInvocation).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  test('surfaces an interrupted provider stream after preserving partial text without usage', async () => {
    let interruptStream!: () => void;
    const recordInvocation = jest.fn(async () => undefined);
    mockPrompt.mockImplementation(async () => {
      await mockListener?.(
        updateEvent('text_start', {
          content: [{ text: '', type: 'text' }],
        }),
      );
      await mockListener?.(
        updateEvent('text_delta', {
          content: [{ text: 'Partial before disconnect.', type: 'text' }],
          delta: 'Partial before disconnect.',
        }),
      );
      await new Promise<void>((resolve) => {
        interruptStream = resolve;
      });
      throw new Error('Provider stream interrupted');
    });
    const reader = createAdapter({
      usageCapture: { context: usageContext(), recorder: { recordInvocation } },
    })
      .stream(messages(), new AbortController().signal)
      .getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { messageId: 'assistant-message-2', type: 'start' },
    });
    await expect(reader.read()).resolves.toMatchObject({ value: { type: 'text-start' } });
    await expect(reader.read()).resolves.toMatchObject({
      value: { delta: 'Partial before disconnect.', type: 'text-delta' },
    });
    interruptStream();
    await expect(reader.read()).rejects.toThrow('Provider stream interrupted');
    expect(recordInvocation).not.toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  test('aborts Pi and closes without finish or usage while keeping emitted chunks readable', async () => {
    let finishPrompt!: () => void;
    mockPrompt.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPrompt = resolve;
        }),
    );
    const recordInvocation = jest.fn(async () => undefined);
    const controller = new AbortController();
    const reader = createAdapter({
      usageCapture: { context: usageContext(), recorder: { recordInvocation } },
    })
      .stream(messages(), controller.signal)
      .getReader();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { messageId: 'assistant-message-2', type: 'start' },
    });
    await mockListener?.(
      updateEvent('text_start', {
        content: [{ text: '', type: 'text' }],
      }),
    );
    await mockListener?.(
      updateEvent('text_delta', {
        content: [{ text: 'Kept partial text.', type: 'text' }],
        delta: 'Kept partial text.',
      }),
    );
    await expect(reader.read()).resolves.toMatchObject({ value: { type: 'text-start' } });
    await expect(reader.read()).resolves.toMatchObject({
      value: { delta: 'Kept partial text.', type: 'text-delta' },
    });

    controller.abort(new Error('User stopped generation'));
    finishPrompt();

    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(recordInvocation).not.toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

function createAdapter(
  overrides: Partial<ConstructorParameters<typeof PiChatStreamAdapter>[0]> = {},
) {
  return new PiChatStreamAdapter({
    apiKey: 'rotated-key',
    baseUrl: 'https://responses.example/v1',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    maxRetries: 2,
    messageId: 'assistant-message-2',
    modelId: 'reasoning-model',
    modelName: 'Reasoning Model',
    providerId: 'responses-provider',
    providerName: 'Responses Provider',
    thinkingLevel: 'high',
    timeoutMs: 45_000,
    ...overrides,
  });
}

function messages(): CherryUIMessage[] {
  return [
    { id: 'user-1', parts: [{ text: 'First question.', type: 'text' }], role: 'user' },
    {
      id: 'assistant-1',
      parts: [
        {
          providerMetadata: {
            pi: {
              redacted: true,
              thinkingSignature: 'reasoning-signature-old',
            },
          },
          text: 'Earlier reasoning.',
          type: 'reasoning',
        },
        {
          providerMetadata: { pi: { textSignature: 'text-signature-old' } },
          text: 'Earlier answer.',
          type: 'text',
        },
      ],
      role: 'assistant',
    },
    { id: 'user-2', parts: [{ text: 'Second question.', type: 'text' }], role: 'user' },
  ];
}

async function emitSuccessfulTurn() {
  const events = [
    updateEvent('thinking_start', {
      content: [{ thinking: '', type: 'thinking' }],
    }),
    updateEvent('thinking_delta', {
      content: [{ thinking: 'Because it is correct.', type: 'thinking' }],
      delta: 'Because it is correct.',
    }),
    updateEvent('thinking_end', {
      content: [
        {
          redacted: false,
          thinking: 'Because it is correct.',
          thinkingSignature: 'reasoning-signature-new',
          type: 'thinking',
        },
      ],
    }),
    updateEvent('text_start', {
      content: [
        { thinking: 'Because it is correct.', type: 'thinking' },
        { text: '', type: 'text' },
      ],
      contentIndex: 1,
    }),
    updateEvent('text_delta', {
      content: [
        { thinking: 'Because it is correct.', type: 'thinking' },
        { text: 'Final answer.', type: 'text' },
      ],
      contentIndex: 1,
      delta: 'Final answer.',
    }),
    updateEvent('text_end', {
      content: [
        { thinking: 'Because it is correct.', type: 'thinking' },
        { text: 'Final answer.', textSignature: 'text-signature-new', type: 'text' },
      ],
      contentIndex: 1,
    }),
    {
      message: assistantMessage(),
      toolResults: [],
      type: 'turn_end',
    },
  ];

  for (const event of events) await mockListener?.(event);
}

function updateEvent(
  type: string,
  input: { content: AssistantMessage['content']; contentIndex?: number; delta?: string },
) {
  const partial = { ...assistantMessage(), content: input.content };
  return {
    assistantMessageEvent: {
      contentIndex: input.contentIndex ?? 0,
      ...(input.delta !== undefined ? { delta: input.delta } : {}),
      partial,
      type,
    },
    message: partial,
    type: 'message_update',
  };
}

function assistantMessage(
  overrides: Partial<Pick<AssistantMessage, 'errorMessage' | 'stopReason'>> = {},
): AssistantMessage {
  return {
    api: 'openai-responses',
    content: [
      {
        redacted: false,
        thinking: 'Because it is correct.',
        thinkingSignature: 'reasoning-signature-new',
        type: 'thinking',
      },
      { text: 'Final answer.', textSignature: 'text-signature-new', type: 'text' },
    ],
    model: 'reasoning-model',
    provider: 'responses-provider',
    role: 'assistant',
    stopReason: 'stop',
    timestamp: 1,
    usage: {
      cacheRead: 3,
      cacheWrite: 2,
      cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
      input: 7,
      output: 8,
      reasoning: 5,
      totalTokens: 20,
    },
    ...overrides,
  };
}

function usageContext(): AiUsageCaptureContext {
  return {
    credentialReceipt: { attribution: 'unknown' },
    messageRef: { id: 'assistant-message-2', kind: 'chat' },
    modelId: 'reasoning-model',
    modelName: 'Reasoning Model',
    pricingSnapshot: null,
    providerId: 'responses-provider',
    providerName: 'Responses Provider',
    reportedCostCurrency: null,
    source: null,
    trustProviderReportedCost: false,
  };
}
