import type { ComposerQueuedMessagePayload } from '@cherrystudio/universal/ai/transport';
import type { UIMessageChunk } from 'ai';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { ResourceScopeCoordinator } from '@/backend/core/resources/ResourceScopeCoordinator';
import { ScopeFencedError } from '@/backend/core/resources/types';
import type {
  BackgroundReplyLifecycle,
  BackgroundReplyTurn,
} from '@/backend/services/backgroundReply';
import { NEW_TOPIC_SNAPSHOT_KEY } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';
import { type FileEntry, FileEntrySchema } from '@/shared/data/types/file';
import type { CherryMessagePart, CherryUIMessage, Message } from '@/shared/data/types/message';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import { ChatRuntime, type ChatRuntimeConfig } from '../ChatRuntime';
import type { ChatRuntimeServices, ChatStreamRequest } from '../ChatRuntimeDependencies';

const mockReadUIMessageStream = jest.fn();
const mockCreateMessageParts = jest.fn(
  async (
    parts: readonly CherryMessagePart[],
  ): Promise<{ entries: FileEntry[]; parts: CherryMessagePart[] }> => ({
    entries: [],
    parts: [...parts],
  }),
);
const mockDiscardInternalEntries = jest.fn(async (_entries: readonly FileEntry[]) => undefined);

describe('ChatRuntime', () => {
  let scopes: ResourceScopeCoordinator;

  afterEach(uninstallTestHost);

  beforeEach(async () => {
    // A real coordinator, not a stub: every task registers with whatever the
    // host serves, so the fencing these cases rely on is the production one.
    scopes = new ResourceScopeCoordinator();
    await installTestHost({ ResourceScopeCoordinator: scopes });
    mockReadUIMessageStream.mockReset();
    mockCreateMessageParts.mockClear();
    mockCreateMessageParts.mockImplementation(async (parts: readonly CherryMessagePart[]) => ({
      entries: [],
      parts: [...parts],
    }));
    mockDiscardInternalEntries.mockClear();
  });

  test('reserves user and assistant messages before streaming and persists terminal assistant parts', async () => {
    const services = createServices();
    const invalidateTopicMessages = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopicMessages, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      fastMode: true,
      reasoningEffort: 'high',
      selectedModelId: 'provider::model' as UniqueModelId,
      text: '  hi  ',
      topicId: 'topic-1',
    });

    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 'topic-1',
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: { parts: [{ type: 'text', text: 'hi' }] },
            parentId: 'active-node',
            status: 'success',
          }),
        }),
      }),
    );
    const reservation = (services.message.createUserMessageWithPlaceholders as jest.Mock).mock
      .calls[0]?.[0];
    expect(reservation.userMessage.dto.messageSnapshot).toBeUndefined();
    expect(reservation.placeholders[0].messageSnapshot).toEqual({
      emoji: '🌟',
      id: 'assistant-1',
      model: { id: 'model', name: 'Model', provider: 'provider' },
      name: 'Assistant',
    });
    expect(reservation.placeholders[0].data.turnOptions).toEqual({
      fastMode: true,
      reasoningEffort: 'high',
    });
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        chatId: 'topic-1',
        fastMode: true,
        messageId: 'assistant-1',
        reasoningEffort: 'high',
        uniqueModelId: 'provider::model',
      }),
    );
    expect(services.message.finalizeAssistantMessage).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: assistantChunk.parts },
        status: 'success',
      }),
    );
    const finalized = (services.message.finalizeAssistantMessage as jest.Mock).mock.calls[0]?.[1];
    expect(finalized.runtimeStats.runtimeTiming).toEqual({
      startedAt: expect.any(Number),
      completedAt: expect.any(Number),
      spans: [],
    });
    expect(finalized.runtimeStats.runtimeTiming.completedAt).toBeGreaterThanOrEqual(
      finalized.runtimeStats.runtimeTiming.startedAt,
    );
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeTimingSink: expect.objectContaining({
          onToolExecutionEnd: expect.any(Function),
          onToolExecutionStart: expect.any(Function),
        }),
      }),
    );
    expect(invalidateTopicMessages).toHaveBeenCalledWith('topic-1');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('reports assembled stream updates and completion to the background reply lifecycle', async () => {
    const services = createServices();
    const backgroundTurn = createBackgroundReplyTurn();
    const backgroundReply = createBackgroundReplyLifecycle(backgroundTurn);
    const runtime = createRuntime({ backgroundReply, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(backgroundReply.startTurn).toHaveBeenCalledWith({
      assistantName: 'Assistant',
      topicId: 'topic-1',
      topicTitle: 'Topic',
    });
    expect(backgroundTurn.update).toHaveBeenCalledWith(assistantChunk);
    expect(backgroundTurn.finish).toHaveBeenCalledWith('completed');
  });

  test('keeps streaming when the background reply lifecycle throws', async () => {
    const throwingServices = createServices();
    const throwingLifecycle: BackgroundReplyLifecycle = {
      clearSession: jest.fn(),
      clearTopic: jest.fn(),
      startTurn: jest.fn(() => {
        throw new Error('native start failed');
      }),
    };
    const throwingRuntime = createRuntime({
      backgroundReply: throwingLifecycle,
      services: throwingServices,
    });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([createUiMessage('assistant-1', 'ok')]));

    await expect(
      throwingRuntime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'hi',
        topicId: 'topic-1',
      }),
    ).resolves.toBeUndefined();
    expect(throwingLifecycle.clearTopic).toHaveBeenCalledWith('topic-1');
  });

  test('pauses the background reply lifecycle while tool approval is pending', async () => {
    const services = createServices();
    const backgroundTurn = createBackgroundReplyTurn();
    const runtime = createRuntime({
      backgroundReply: createBackgroundReplyLifecycle(backgroundTurn),
      services,
    });
    const approvalChunk = {
      id: 'assistant-1',
      parts: [createApprovalPart('approval-1')],
      role: 'assistant',
    } as CherryUIMessage;
    mockReadUIMessageStream.mockReturnValue(asyncIterable([approvalChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'approve',
      topicId: 'topic-1',
    });

    expect(backgroundTurn.awaitApproval).toHaveBeenCalledWith(approvalChunk);
    expect(backgroundTurn.finish).not.toHaveBeenCalled();
  });

  test('reports failed and cancelled terminal outcomes to the background reply lifecycle', async () => {
    const failedServices = createServices();
    const failedTurn = createBackgroundReplyTurn();
    mockReadUIMessageStream.mockReturnValue(failingAsyncIterable(new Error('stream failed')));
    const failedRuntime = createRuntime({
      backgroundReply: createBackgroundReplyLifecycle(failedTurn),
      services: failedServices,
    });

    await failedRuntime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'fail',
      topicId: 'topic-1',
    });
    expect(failedTurn.finish).toHaveBeenCalledWith('failed');

    const cancelledServices = createServices();
    const cancelledTurn = createBackgroundReplyTurn();
    const cancelledRuntime = createRuntime({
      backgroundReply: createBackgroundReplyLifecycle(cancelledTurn),
      services: cancelledServices,
    });
    mockReadUIMessageStream.mockImplementation(() =>
      (async function* () {
        cancelledRuntime.abort('topic-1');
        yield createUiMessage('assistant-1', 'partial');
      })(),
    );

    await cancelledRuntime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'cancel',
      topicId: 'topic-1',
    });
    expect(cancelledTurn.finish).toHaveBeenCalledWith('cancelled');
  });

  test('uses the bound assistant model without reading the global default', async () => {
    const services = createServices();
    const assistantModelId = 'assistant-provider::assistant-model' as UniqueModelId;
    services.assistant.getById = jest.fn(async (id: string) =>
      createAssistant(id, assistantModelId),
    );
    services.model.getById = jest.fn(async (modelId: UniqueModelId) => createModel(modelId));
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'hello')]),
    );

    await runtime.sendText({ text: 'hi', topicId: 'topic-1' });

    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: assistantModelId }),
    );
    expect((services.preference.get as jest.Mock).mock.calls.map(([key]) => key)).not.toContain(
      'chat.default_model_id',
    );
  });

  test('rejects a bound assistant with no model instead of falling back to the global default', async () => {
    const services = createServices();
    services.assistant.getById = jest.fn(async (id: string) => createAssistant(id, null));
    const runtime = createRuntime({ services });

    await expect(runtime.sendText({ text: 'hi', topicId: 'topic-1' })).rejects.toThrow(
      'Assistant assistant-1 has no model configured',
    );

    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(services.preference.get).not.toHaveBeenCalled();
  });

  test('uses the global default model for an assistant-less topic', async () => {
    const services = createServices();
    const defaultModelId = 'default-provider::default-model' as UniqueModelId;
    services.topic.getById = jest.fn(async () => createTopic({ assistantId: undefined }));
    services.preference.get = jest.fn(async (key: string) => {
      if (key === 'chat.default_model_id') return defaultModelId;
      if (key === 'topic.naming.enabled') return false;
      return '';
    }) as unknown as ChatRuntimeServices['preference']['get'];
    services.model.getById = jest.fn(async (modelId: UniqueModelId) => createModel(modelId));
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'hello')]),
    );

    await runtime.sendText({ text: 'hi', topicId: 'topic-1' });

    expect(services.preference.get).toHaveBeenCalledWith('chat.default_model_id');
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: defaultModelId }),
    );
  });

  test('allows an explicit model override when the bound assistant has no model', async () => {
    const services = createServices();
    const overrideModelId = 'override-provider::override-model' as UniqueModelId;
    services.assistant.getById = jest.fn(async (id: string) => createAssistant(id, null));
    services.model.getById = jest.fn(async (modelId: UniqueModelId) => createModel(modelId));
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'hello')]),
    );

    await runtime.sendText({
      selectedModelId: overrideModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: overrideModelId }),
    );
    expect((services.preference.get as jest.Mock).mock.calls.map(([key]) => key)).not.toContain(
      'chat.default_model_id',
    );
  });

  test('persists file parts from the send payload', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const filePart = createFilePart('file://brief.pdf');
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      parts: [{ type: 'text', text: 'summarize' } as CherryMessagePart, filePart],
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'summarize',
      topicId: 'topic-1',
    });

    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: {
              parts: [{ type: 'text', text: 'summarize' }, filePart],
            },
          }),
        }),
      }),
    );
  });

  test('does not persist stream metadata usage over the durable ledger projection', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const assistantChunk = {
      ...createUiMessage('assistant-1', 'hello'),
      metadata: { totalTokens: 150, promptTokens: 100, completionTokens: 50 },
    };
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: assistantChunk.parts },
        status: 'success',
      }),
    );
  });

  test('persists source-url citations exactly as streamed', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const assistantChunk = {
      id: 'assistant-1',
      parts: [
        { type: 'text', text: 'Cherry Studio ships on mobile[1]' },
        {
          type: 'source-url',
          sourceId: 'citation-0',
          url: 'https://source1.test',
          title: 'Source 1',
        },
      ],
      role: 'assistant',
    } as CherryUIMessage;
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    // No persist-time citation projection: the renderer reads source-url parts
    // directly, so rewriting them here only added metadata nothing consumed.
    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: assistantChunk.parts },
        status: 'success',
      }),
    );
  });

  test('sends a file-only payload without requiring text', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const filePart = createFilePart('file://image.png');
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      parts: [filePart],
      selectedModelId: 'provider::model' as UniqueModelId,
      text: '',
      topicId: 'topic-1',
    });

    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: { parts: [filePart] },
          }),
        }),
      }),
    );
  });

  test('keeps the terminal assistant overlay until messages have refreshed', async () => {
    const services = createServices();
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    const invalidateTopicMessages = createDeferredInvalidation();
    const runtime = createRuntime({
      invalidateTopicMessages: invalidateTopicMessages.fn,
      services,
    });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    const sendPromise = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    const finalizeMessage = services.message.finalizeAssistantMessage as jest.Mock;
    await waitUntil(() => finalizeMessage.mock.calls.length > 0);

    expect(runtime.getTopicSnapshot('topic-1')).toEqual(
      expect.objectContaining({
        hasHistoryBeforePendingTurn: true,
        overlayMessage: expect.objectContaining({
          data: { parts: assistantChunk.parts },
          id: 'assistant-1',
          status: 'success',
        }),
        status: 'idle',
      }),
    );

    invalidateTopicMessages.resolve();
    await sendPromise;

    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('keeps a failed assistant overlay until messages have refreshed', async () => {
    const services = createServices();
    const invalidateTopicMessages = createDeferredInvalidation();
    const runtime = createRuntime({
      invalidateTopicMessages: invalidateTopicMessages.fn,
      services,
    });
    mockReadUIMessageStream.mockReturnValue(failingAsyncIterable(new Error('stream failed')));

    const sendPromise = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    const finalizeMessage = services.message.finalizeAssistantMessage as jest.Mock;
    await waitUntil(() => finalizeMessage.mock.calls.length > 0);

    expect(runtime.getTopicSnapshot('topic-1')).toEqual(
      expect.objectContaining({
        overlayMessage: expect.objectContaining({
          data: {
            parts: [
              expect.objectContaining({
                data: expect.objectContaining({ message: 'stream failed' }),
                type: 'data-error',
              }),
            ],
          },
          id: 'assistant-1',
          status: 'error',
        }),
        status: 'idle',
      }),
    );

    invalidateTopicMessages.resolve();
    await sendPromise;

    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('persists an error status when streaming fails after reservation', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(failingAsyncIterable(new Error('stream failed')));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            expect.objectContaining({
              data: expect.objectContaining({ message: 'stream failed' }),
              type: 'data-error',
            }),
          ],
        },
        status: 'error',
      }),
    );
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('persists AI SDK error fields (e.g. statusCode) alongside message/name/stack', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const apiError = Object.assign(new Error('rate limited'), {
      statusCode: 429,
      isRetryable: true,
    });
    mockReadUIMessageStream.mockReturnValue(failingAsyncIterable(apiError));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            expect.objectContaining({
              data: expect.objectContaining({
                message: 'rate limited',
                statusCode: 429,
                isRetryable: true,
              }),
              type: 'data-error',
            }),
          ],
        },
        status: 'error',
      }),
    );
  });

  test('appends an error part when streaming fails after partial output', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const partialChunk = createUiMessage('assistant-1', 'partial');
    const createdEntry = createFileEntry();
    const managedUri = 'cherry://file/00000000-0000-7000-8000-000000000001';
    mockCreateMessageParts.mockResolvedValueOnce({
      entries: [createdEntry],
      parts: [createFilePart(managedUri)],
    });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterableWithFailure([partialChunk], new Error('stream failed')),
    );

    await runtime.sendText({
      parts: [createFilePart('file://brief.pdf')],
      selectedModelId: 'provider::model' as UniqueModelId,
      text: '',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            { type: 'text', text: 'partial' },
            expect.objectContaining({
              data: expect.objectContaining({ message: 'stream failed' }),
              type: 'data-error',
            }),
          ],
        },
        status: 'error',
      }),
    );
    expect(mockDiscardInternalEntries).not.toHaveBeenCalled();
  });

  test('drops content-free parts the accumulator left behind on a successful turn', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([
        {
          id: 'assistant-1',
          parts: [
            { type: 'text', text: 'answer' },
            // A final step that produced no output: invisible, but it still
            // injects layout spacing on render.
            { type: 'text', text: '' },
            { state: 'done', text: '  ', type: 'reasoning' },
          ],
          role: 'assistant',
        } as CherryUIMessage,
      ]),
    );

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: [{ type: 'text', text: 'answer' }] },
        status: 'success',
      }),
    );
  });

  test('terminalizes a tool part left mid-call when the stream fails', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterableWithFailure(
        [
          {
            id: 'assistant-1',
            parts: [
              {
                input: { q: 'x' },
                state: 'input-available',
                toolCallId: 'call-1',
                toolName: 'search',
                type: 'dynamic-tool',
              },
            ],
            role: 'assistant',
          } as unknown as CherryUIMessage,
        ],
        new Error('stream failed'),
      ),
    );

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    // A tool call with no result poisons the branch: convertToModelMessages
    // replays it on the next turn and the provider 400s.
    const finalized = (services.message.finalizeAssistantMessage as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    expect(finalized.data.parts[0]).toMatchObject({
      errorText: 'Stream errored before tool completed',
      state: 'output-error',
    });
    expect(finalized.status).toBe('error');
  });

  test('finalizes a lingering streaming reasoning part when the stream fails after partial output', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const partialChunk: CherryUIMessage = {
      id: 'assistant-1',
      parts: [
        {
          providerMetadata: { cherry: { startedAt: 1000 } },
          state: 'streaming',
          text: 'still thinking',
          type: 'reasoning',
        } as CherryMessagePart,
      ],
      role: 'assistant',
    } as CherryUIMessage;
    mockReadUIMessageStream.mockReturnValue(
      asyncIterableWithFailure([partialChunk], new Error('stream failed')),
    );
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(4500);

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            expect.objectContaining({
              providerMetadata: { cherry: { startedAt: 1000, thinkingMs: 3500 } },
              state: 'done',
              type: 'reasoning',
            }),
            expect.objectContaining({ type: 'data-error' }),
          ],
        },
        status: 'error',
      }),
    );

    dateSpy.mockRestore();
  });

  test('creates a topic before sending the first new-topic message', async () => {
    const services = createServices();
    const invalidateTopics = jest.fn(async () => undefined);
    const openTopic = jest.fn();
    const runtime = createRuntime({ invalidateTopics, openTopic, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: '  first message from empty topic  ',
    });

    expect(services.topic.create).toHaveBeenCalledWith({
      name: 'first message from empty topic',
    });
    expect(invalidateTopics).toHaveBeenCalled();
    expect(openTopic).toHaveBeenCalledWith('topic-1');
    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 'topic-1',
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: { parts: [{ type: 'text', text: 'first message from empty topic' }] },
            parentId: null,
          }),
        }),
      }),
    );
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'topic-1',
        messageId: 'assistant-1',
        uniqueModelId: 'provider::model',
      }),
    );
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('publishes the new-topic turn before navigating and before persisting it', async () => {
    const services = createServices();
    const snapshotAtNavigation: ReturnType<typeof runtime.getTopicSnapshot>[] = [];
    let reservationsAtNavigation = -1;
    const openTopic = jest.fn((topicId: string) => {
      snapshotAtNavigation.push(runtime.getTopicSnapshot(topicId));
      reservationsAtNavigation = (services.message.createUserMessageWithPlaceholders as jest.Mock)
        .mock.calls.length;
    });
    const runtime = createRuntime({ openTopic, services });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'hello')]),
    );

    await runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first message from empty topic',
    });

    // 目的地挂载的那一刻要展示的东西必须已经在快照里，否则就是导航到一个空界面。
    expect(openTopic).toHaveBeenCalledWith('topic-1');
    const published = snapshotAtNavigation[0];
    expect(published?.status).toBe('reserving');
    expect(published?.hasHistoryBeforePendingTurn).toBe(false);
    expect(published?.pendingUserMessage?.data.parts).toEqual([
      { type: 'text', text: 'first message from empty topic' },
    ]);
    expect(published?.overlayMessage?.status).toBe('pending');
    // 而且它比落库更早：这一版把导航从「写完之后」挪到了「写之前」。
    expect(reservationsAtNavigation).toBe(0);
  });

  test('persists the turn under the ids it already published', async () => {
    const services = createServices();
    let publishedSnapshot: ReturnType<typeof runtime.getTopicSnapshot> | undefined;
    const runtime = createRuntime({
      openTopic: (topicId) => {
        publishedSnapshot = runtime.getTopicSnapshot(topicId);
      },
      services,
    });
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'hello')]),
    );

    await runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first message from empty topic',
    });

    // 乐观行与落库行同一身份，投影才会就地替换而不是追加出一条重复气泡。
    const reservation = (services.message.createUserMessageWithPlaceholders as jest.Mock).mock
      .calls[0]?.[0];
    expect(reservation.userMessage.id).toBe(publishedSnapshot?.pendingUserMessage?.id);
    expect(reservation.placeholders.map((placeholder: { id: string }) => placeholder.id)).toEqual(
      publishedSnapshot?.overlayMessages?.map((message) => message.id),
    );
    expect(reservation.userMessage.id).toEqual(expect.any(String));
    expect(reservation.placeholders[0].id).not.toBe(reservation.userMessage.id);
  });

  test('starts another new topic while the previous one is still streaming', async () => {
    const services = createServices();
    const createTopicMock = jest
      .fn()
      .mockResolvedValueOnce({ ...createTopic({ id: 'topic-1' }), activeNodeId: undefined })
      .mockResolvedValueOnce({ ...createTopic({ id: 'topic-2' }), activeNodeId: undefined });
    services.topic.create = createTopicMock;
    const runtime = createRuntime({ services });
    const streamGate = createDeferred();
    mockReadUIMessageStream
      .mockReturnValueOnce(
        gatedAsyncIterable([createUiMessage('assistant-1', 'streaming')], streamGate.promise),
      )
      .mockReturnValueOnce(asyncIterable([createUiMessage('assistant-1', 'done')]));

    const firstSend = runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first topic',
    });
    await waitUntil(() => runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status === 'streaming');

    // The first reply is still streaming, which leaves `newTopicHandoffTopicId`
    // set — the assistant detail screen's "start chat" must still be able to
    // open a second new topic instead of failing the send.
    await expect(
      runtime.sendNewTopicText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'second topic',
      }),
    ).resolves.toBeUndefined();

    expect(createTopicMock).toHaveBeenCalledTimes(2);
    expect(createTopicMock).toHaveBeenLastCalledWith({ name: 'second topic' });

    streamGate.resolve();
    await firstSend;
  });

  test('creates a new topic with an assistant and resolves the assistant model', async () => {
    const services = createServices();
    services.assistant.getById = jest.fn(async () =>
      createAssistant('assistant-1', 'provider::assistant-model' as UniqueModelId),
    );
    services.model.getById = jest.fn(async (modelId: UniqueModelId) => createModel(modelId));
    const runtime = createRuntime({ services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendNewTopicText({
      assistantId: 'assistant-1',
      text: 'hello assistant',
    });

    expect(services.topic.create).toHaveBeenCalledWith({
      assistantId: 'assistant-1',
      name: 'hello assistant',
    });
    expect(services.assistant.getById).toHaveBeenCalledWith('assistant-1');
    expect(services.model.getById).toHaveBeenCalledWith('provider::assistant-model');
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        uniqueModelId: 'provider::assistant-model',
      }),
    );
  });

  test('updates an existing topic assistant before sending when provided', async () => {
    const services = createServices();
    services.topic.getById = jest.fn(async () => createTopic({ assistantId: 'assistant-old' }));
    services.topic.update = jest.fn(async () => createTopic({ assistantId: 'assistant-next' }));
    const invalidateTopics = jest.fn(async () => undefined);
    const invalidateTopicMessages = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopicMessages, invalidateTopics, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      assistantId: 'assistant-next',
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.topic.update).toHaveBeenCalledWith('topic-1', {
      assistantId: 'assistant-next',
    });
    expect(invalidateTopics).toHaveBeenCalled();
    expect(invalidateTopicMessages).toHaveBeenCalledWith('topic-1');
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-next',
        uniqueModelId: 'provider::model',
      }),
    );
  });

  test('uses the first attachment name for file-only new topic titles', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    const sourcePart = createFilePart('file://brief.pdf');
    const managedPart = {
      ...sourcePart,
      providerMetadata: {
        cherry: { fileEntryId: '00000000-0000-7000-8000-000000000001' },
      },
      url: 'cherry://file/00000000-0000-7000-8000-000000000001',
    } as CherryMessagePart;
    const createdEntry = createFileEntry();
    mockCreateMessageParts.mockResolvedValueOnce({
      entries: [createdEntry],
      parts: [managedPart],
    });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendNewTopicText({
      parts: [sourcePart],
      selectedModelId: 'provider::model' as UniqueModelId,
      text: '',
    });

    expect(services.topic.create).toHaveBeenCalledWith({
      name: 'brief.pdf',
    });
    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: { parts: [managedPart] },
          }),
        }),
      }),
    );
    expect(mockDiscardInternalEntries).not.toHaveBeenCalled();
  });

  test('rejects and does not reserve messages when context resolution fails', async () => {
    const services = createServices();
    services.model.getById = jest.fn(async () => null);
    const runtime = createRuntime({ services });

    await expect(
      runtime.sendText({
        selectedModelId: 'provider::missing' as UniqueModelId,
        text: 'hi',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('Cannot resolve model: provider::missing');

    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('rejects and restores the topic snapshot when reservation fails', async () => {
    const services = createServices();
    const createdEntry = createFileEntry();
    const managedUri = 'cherry://file/00000000-0000-7000-8000-000000000001';
    mockCreateMessageParts.mockResolvedValueOnce({
      entries: [createdEntry],
      parts: [createFilePart(managedUri)],
    });
    services.message.createUserMessageWithPlaceholders = jest.fn(async () => {
      throw new Error('reservation failed');
    });
    const runtime = createRuntime({ services });

    await expect(
      runtime.sendText({
        parts: [createFilePart('file://brief.pdf')],
        selectedModelId: 'provider::model' as UniqueModelId,
        text: '',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('reservation failed');

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(mockDiscardInternalEntries).toHaveBeenCalledWith([createdEntry]);
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('does not reserve messages when an existing topic send is aborted while reserving', async () => {
    const services = createServices();
    const topicDeferred = createDeferred();
    services.topic.getById = jest.fn(async () => {
      await topicDeferred.promise;
      return createTopic();
    });
    const runtime = createRuntime({ services });

    const sendPromise = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'reserving');
    runtime.abort('topic-1');
    topicDeferred.resolve();
    await sendPromise;

    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('cancels reserved messages when aborted while reservation is pending', async () => {
    const services = createServices();
    const reservationDeferred = createDeferred();
    const userMessage = createMessage('user-1', 'user');
    const assistantMessage = createMessage('assistant-1', 'assistant');
    services.message.createUserMessageWithPlaceholders = jest.fn(async () => {
      await reservationDeferred.promise;
      return {
        placeholders: [assistantMessage],
        userMessage,
      };
    });
    const runtime = createRuntime({ services });

    const sendPromise = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    await waitUntil(
      () => (services.message.createUserMessageWithPlaceholders as jest.Mock).mock.calls.length > 0,
    );
    runtime.abort('topic-1');
    reservationDeferred.resolve();
    await sendPromise;

    expect(services.message.delete).toHaveBeenCalledWith('user-1', true, 'parent');
    expect(services.message.getPathToNode).not.toHaveBeenCalled();
    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('mirrors new topic handoff snapshots and forwards abort to the created topic', async () => {
    const services = createServices();
    const streamDeferred = createDeferred<ReadableStream>();
    services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
      await streamDeferred.promise;
      return new ReadableStream({
        start(controller) {
          request.requestOptions?.signal?.addEventListener('abort', () => {
            controller.error(request.requestOptions?.signal?.reason);
          });
        },
      });
    });
    mockReadUIMessageStream.mockImplementation(({ stream }: { stream: ReadableStream }) => stream);
    const runtime = createRuntime({ services });

    const sendPromise = runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first',
    });

    await waitUntil(() => runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status === 'streaming');
    expect(runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY)).toEqual(
      expect.objectContaining({
        hasHistoryBeforePendingTurn: false,
        overlayMessage: expect.objectContaining({ id: 'assistant-1' }),
        status: 'streaming',
      }),
    );

    runtime.abort(NEW_TOPIC_SNAPSHOT_KEY);
    expect(runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status).toBe('aborting');
    expect(
      (services.ai.streamText as jest.Mock).mock.calls[0][0].requestOptions.signal.aborted,
    ).toBe(true);

    streamDeferred.resolve(new ReadableStream());
    await sendPromise;
    expect(runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status).toBe('idle');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('auto-names the topic from the conversation summary after the first exchange', async () => {
    const services = createServices();
    services.topic.getById = jest.fn(async () => createTopic({ name: 'hi' }));
    const preferences: Record<string, unknown> = {
      'app.language': 'en-US',
      'topic.naming.enabled': true,
      'topic.naming.model_id': null,
      'topic.naming_prompt': '',
    };
    services.preference.get = jest.fn(
      async (key: string) => preferences[key],
    ) as typeof services.preference.get;
    services.ai.generateText = jest.fn(async () => ({ text: 'Generated Topic Title' }));
    const invalidateTopics = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopics, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    await waitUntil(() => (services.topic.update as jest.Mock).mock.calls.length > 0);

    expect(services.topic.update).toHaveBeenCalledWith('topic-1', {
      isNameManuallyEdited: false,
      name: 'Generated Topic Title',
    });
    expect(invalidateTopics).toHaveBeenCalled();
  });

  test('does not auto-name a topic that already has history', async () => {
    const services = createServices();
    services.message.getPathToNode = jest.fn(async () => [
      createMessage('user-0', 'user'),
      createMessage('assistant-0', 'assistant'),
      createMessage('user-1', 'user'),
    ]);
    services.ai.generateText = jest.fn(async () => ({ text: 'Generated Topic Title' }));
    const runtime = createRuntime({ services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.ai.generateText).not.toHaveBeenCalled();
  });

  test('persists success, enters awaiting-approval, and skips naming while approval is pending', async () => {
    const services = createServices();
    services.ai.generateText = jest.fn(async () => ({ text: 'Should Not Name' }));
    const runtime = createRuntime({ services });
    const approvalChunk = {
      id: 'assistant-1',
      parts: [createApprovalPart('approval-1')],
      role: 'assistant',
    } as CherryUIMessage;
    mockReadUIMessageStream.mockReturnValue(asyncIterable([approvalChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: approvalChunk.parts },
        status: 'success',
      }),
    );
    const finalized = (services.message.finalizeAssistantMessage as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    expect(finalized.runtimeStats.runtimeTiming).toMatchObject({
      startedAt: expect.any(Number),
      spans: [
        {
          id: 'approval:approval-1',
          kind: 'approval-wait',
          approvalId: 'approval-1',
          toolCallId: 'call-approval-1',
          toolName: 'search',
          startedAt: expect.any(Number),
        },
      ],
    });
    expect(finalized.runtimeStats.runtimeTiming).not.toHaveProperty('completedAt');
    expect(finalized.runtimeStats.runtimeTiming.spans[0]).not.toHaveProperty('completedAt');
    expect(services.ai.generateText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');
  });

  test('settles pending approvals terminally when the turn is aborted mid-stream', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const approvalChunk = {
      id: 'assistant-1',
      parts: [
        { type: 'text', text: 'checking' } as CherryMessagePart,
        createApprovalPart('approval-1'),
      ],
      role: 'assistant',
    } as CherryUIMessage;
    mockReadUIMessageStream.mockReturnValue(
      (async function* () {
        yield approvalChunk;
        runtime.abort('topic-1');
        yield approvalChunk;
      })(),
    );

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            { type: 'text', text: 'checking' },
            // Terminal, not merely responded: an unanswered tool call would make
            // every later request on this branch fail at the provider.
            expect.objectContaining({
              approval: expect.objectContaining({ approved: false, id: 'approval-1' }),
              state: 'output-denied',
            }),
          ],
        },
        status: 'paused',
      }),
    );
    const finalized = (services.message.finalizeAssistantMessage as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    expect(finalized.runtimeStats.runtimeTiming).toMatchObject({
      completedAt: expect.any(Number),
      spans: [
        expect.objectContaining({ approvalId: 'approval-1', completedAt: expect.any(Number) }),
      ],
    });
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('respondToolApproval resumes the same assistant message with the pinned row model', async () => {
    const services = createServices();
    const settledMessage = {
      ...createMessage('assistant-1', 'assistant'),
      data: {
        parts: [createRespondedApprovalPart('approval-1')],
        turnOptions: { fastMode: true, reasoningEffort: 'high' as const },
      },
      modelId: 'provider::pinned' as UniqueModelId,
      stats: {
        runtimeTiming: {
          startedAt: 1_000,
          spans: [
            {
              id: 'approval:approval-1',
              kind: 'approval-wait' as const,
              approvalId: 'approval-1',
              toolCallId: 'call-approval-1',
              startedAt: 1_100,
              completedAt: 2_000,
            },
          ],
        },
      },
      status: 'pending' as const,
    };
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: settledMessage.data.parts ?? [],
    }));
    services.message.getById = jest.fn(async () => settledMessage);
    services.message.getPathToNode = jest.fn(async () => [
      createMessage('user-1', 'user'),
      settledMessage,
    ]);
    services.model.getById = jest.fn(async (modelId: UniqueModelId) => createModel(modelId));
    const invalidateTopicMessages = jest.fn(async () => undefined);
    const backgroundReply = createBackgroundReplyLifecycle();
    const runtime = createRuntime({ backgroundReply, invalidateTopicMessages, services });
    const finalChunk = createUiMessage('assistant-1', 'tool ran; here is the answer');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([finalChunk]));

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
      updatedInput: { query: 'revised' },
    });

    expect(services.message.applyToolApprovalDecisions).toHaveBeenCalledWith('assistant-1', [
      { approvalId: 'approval-1', approved: true, updatedInput: { query: 'revised' } },
    ]);
    expect(services.message.getPathToNode).toHaveBeenCalledWith('assistant-1');
    expect(backgroundReply.startTurn).toHaveBeenCalledWith({
      assistantName: 'Assistant',
      topicId: 'topic-1',
      topicTitle: 'Topic',
    });
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'topic-1',
        fastMode: true,
        messageId: 'assistant-1',
        reasoningEffort: 'high',
        uniqueModelId: 'provider::pinned',
      }),
    );
    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: finalChunk.parts },
        status: 'success',
      }),
    );
    expect(
      (services.message.finalizeAssistantMessage as jest.Mock).mock.calls.at(-1)?.[1].runtimeStats
        .runtimeTiming,
    ).toMatchObject({
      startedAt: 1_000,
      completedAt: expect.any(Number),
      spans: [expect.objectContaining({ id: 'approval:approval-1', completedAt: 2_000 })],
    });
    expect(invalidateTopicMessages).toHaveBeenCalledWith('topic-1');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('does not resume while other approvals on the message are still pending', async () => {
    const services = createServices();
    const pendingPart = createApprovalPart('approval-2');
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: [createRespondedApprovalPart('approval-1'), pendingPart],
    }));
    const runtime = createRuntime({ services });

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');
  });

  test('treats a duplicate decision as idempotent and does not resume twice', async () => {
    const services = createServices();
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: ['approval-1'],
      appliedApprovalIds: [],
      parts: [createRespondedApprovalPart('approval-1')],
    }));
    const backgroundReply = createBackgroundReplyLifecycle();
    const runtime = createRuntime({ backgroundReply, services });

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });

    expect(services.message.getById).not.toHaveBeenCalled();
    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(backgroundReply.clearTopic).toHaveBeenCalledWith('topic-1');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('rejects an approval response while the topic already has an active turn', async () => {
    const services = createServices();
    const topicDeferred = createDeferred();
    services.topic.getById = jest.fn(async () => {
      await topicDeferred.promise;
      return createTopic();
    });
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([createUiMessage('assistant-1', 'ok')]));

    const sendPromise = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'reserving');

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('A response is already streaming for this topic.');
    expect(services.message.applyToolApprovalDecisions).not.toHaveBeenCalled();

    topicDeferred.resolve();
    await sendPromise;
  });

  test('rethrows when the approval decision no longer matches a pending request', async () => {
    const services = createServices();
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: [],
      parts: [createApprovalPart('approval-1')],
    }));
    const backgroundReply = createBackgroundReplyLifecycle();
    const runtime = createRuntime({ backgroundReply, services });

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('The tool approval request was not found on the message.');

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(backgroundReply.clearTopic).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');
  });

  test('reports a deleted approval message without starting a continuation', async () => {
    const services = createServices();
    services.message.applyToolApprovalDecisions = jest.fn(async () => null);
    const backgroundReply = createBackgroundReplyLifecycle();
    const runtime = createRuntime({ backgroundReply, services });

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('The tool approval message no longer exists.');

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(backgroundReply.clearTopic).toHaveBeenCalledWith('topic-1');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('persists an error and keeps prior parts when the resumed stream fails before any chunk', async () => {
    const services = createServices();
    const priorParts = [
      { type: 'text', text: 'first segment' } as CherryMessagePart,
      createRespondedApprovalPart('approval-1'),
    ];
    const settledMessage = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: priorParts },
      status: 'pending' as const,
    };
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: settledMessage.data.parts ?? [],
    }));
    services.message.getById = jest.fn(async () => settledMessage);
    services.message.getPathToNode = jest.fn(async () => [
      createMessage('user-1', 'user'),
      settledMessage,
    ]);
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(failingAsyncIterable(new Error('resume failed')));

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            priorParts[0],
            // Approved, but the resume never delivered an output — the row must
            // not keep a tool call the model can never see a result for.
            expect.objectContaining({
              approval: { approved: true, id: 'approval-1' },
              errorText: expect.any(String),
              state: 'output-error',
            }),
            expect.objectContaining({
              data: expect.objectContaining({ message: 'resume failed' }),
              type: 'data-error',
            }),
          ],
        },
        status: 'error',
      }),
    );
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('falls back to the bound assistant model when the pinned resume model is gone', async () => {
    const services = createServices();
    const settledMessage = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [createRespondedApprovalPart('approval-1')] },
      modelId: 'provider::gone' as UniqueModelId,
      status: 'pending' as const,
    };
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: settledMessage.data.parts ?? [],
    }));
    services.message.getById = jest.fn(async () => settledMessage);
    services.message.getPathToNode = jest.fn(async () => [
      createMessage('user-1', 'user'),
      settledMessage,
    ]);
    services.model.getById = jest.fn(async (modelId: UniqueModelId) =>
      modelId === ('provider::gone' as UniqueModelId) ? null : createModel(modelId),
    );
    services.assistant.getById = jest.fn(async () =>
      createAssistant('assistant-1', 'provider::model' as UniqueModelId),
    );
    const runtime = createRuntime({ services });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([createUiMessage('assistant-1', 'ok')]));

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });

    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueModelId: 'provider::model' }),
    );
  });

  test('catches up auto-naming after a first-exchange approval resume succeeds', async () => {
    const services = createServices();
    services.topic.getById = jest.fn(async () => createTopic({ name: 'hi' }));
    const preferences: Record<string, unknown> = {
      'app.language': 'en-US',
      'topic.naming.enabled': true,
      'topic.naming.model_id': null,
      'topic.naming_prompt': '',
    };
    services.preference.get = jest.fn(
      async (key: string) => preferences[key],
    ) as typeof services.preference.get;
    services.ai.generateText = jest.fn(async () => ({ text: 'Named After Resume' }));
    const settledMessage = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [createRespondedApprovalPart('approval-1')] },
      status: 'pending' as const,
    };
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: settledMessage.data.parts ?? [],
    }));
    services.message.getById = jest.fn(async () => settledMessage);
    services.message.getPathToNode = jest.fn(async () => [
      {
        ...createMessage('user-1', 'user'),
        data: { parts: [{ type: 'text', text: 'hi' } as CherryMessagePart] },
      },
      settledMessage,
    ]);
    const invalidateTopics = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopics, services });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([createUiMessage('assistant-1', 'ok')]));

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });
    await waitUntil(() => (services.topic.update as jest.Mock).mock.calls.length > 0);

    expect(services.topic.update).toHaveBeenCalledWith('topic-1', {
      isNameManuallyEdited: false,
      name: 'Named After Resume',
    });
  });

  test('rejects a new message while the active tip is awaiting approval', async () => {
    const services = createServices();
    services.message.getById = jest.fn(async () => ({
      ...createMessage('active-node', 'assistant'),
      data: { parts: [createApprovalPart('approval-1')] },
      status: 'success' as const,
    }));
    const runtime = createRuntime({ services });

    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'never mind, new question',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('Resolve the pending tool approval before sending another message.');

    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(mockCreateMessageParts).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('keeps the streamed answer when teardown fails after the stream took over', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const assistantChunk = createUiMessage('assistant-1', 'the whole answer');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));
    // A subscriber that blows up during teardown: the error escapes the stream
    // helper only after it has already persisted the streamed answer.
    runtime.subscribe(() => {
      if ((services.message.finalizeAssistantMessage as jest.Mock).mock.calls.length > 0) {
        throw new Error('subscriber blew up');
      }
    });

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    // The placeholder's parts are empty; a second persist from runTopicTurn
    // would overwrite the streamed answer with them.
    expect(services.message.finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: assistantChunk.parts },
        status: 'success',
      }),
    );
  });

  test('releases the topic when the refetch throws before the stream starts', async () => {
    const services = createServices();
    const invalidateTopicMessages = jest.fn(async () => {
      throw new Error('refetch failed');
    });
    const runtime = createRuntime({ invalidateTopicMessages, services });
    mockReadUIMessageStream.mockReturnValue(asyncIterable([createUiMessage('assistant-1', 'ok')]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    // The pre-stream invalidate is deliberately unguarded, so the turn dies
    // there: what is under test is the teardown that runs afterwards.
    expect(services.ai.streamText).not.toHaveBeenCalled();

    // A stranded activeTurns entry would make every later send throw.
    mockReadUIMessageStream.mockReturnValue(
      asyncIterable([createUiMessage('assistant-1', 'second')]),
    );
    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'again',
        topicId: 'topic-1',
      }),
    ).resolves.toBeUndefined();
  });

  test('keeps the streamed answer and releases the topic when the post-turn refetch throws', async () => {
    const services = createServices();
    // Only the second call — the one in releaseTurn — goes through the safe
    // invalidate; throwing on the first would kill the turn before it streams.
    const invalidateTopicMessages = jest
      .fn(async () => undefined)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('refetch failed');
      });
    const runtime = createRuntime({ invalidateTopicMessages, services });
    const assistantChunk = createUiMessage('assistant-1', 'the whole answer');
    mockReadUIMessageStream.mockReturnValueOnce(asyncIterable([assistantChunk]));

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    // Teardown failing must not cost the turn its answer: the row keeps what
    // streamed in, with no second persist falling back to empty parts.
    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: { parts: assistantChunk.parts },
        status: 'success',
      }),
    );
    // And the rest of the teardown still ran: the terminal overlay is dropped,
    // which a refetch failure taking the cleanup with it would skip.
    expect(runtime.getTopicSnapshot('topic-1')).toEqual({ status: 'idle' });

    // A stranded activeTurns entry would make every later send throw.
    mockReadUIMessageStream.mockReturnValueOnce(
      asyncIterable([createUiMessage('assistant-1', 'second')]),
    );
    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'again',
        topicId: 'topic-1',
      }),
    ).resolves.toBeUndefined();
  });

  test('settles the row when the approval resume fails before the stream starts', async () => {
    const services = createServices();
    const settledMessage = {
      ...createMessage('assistant-1', 'assistant'),
      data: { parts: [createRespondedApprovalPart('approval-1')] },
      status: 'pending' as const,
    };
    services.message.applyToolApprovalDecisions = jest.fn(async () => ({
      alreadySettledApprovalIds: [],
      appliedApprovalIds: ['approval-1'],
      parts: settledMessage.data.parts ?? [],
    }));
    services.message.getById = jest.fn(async () => settledMessage);
    services.topic.getById = jest.fn(async () => {
      throw new Error('topic lookup failed');
    });
    const backgroundReply = createBackgroundReplyLifecycle();
    const runtime = createRuntime({ backgroundReply, services });

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('topic lookup failed');

    // The decision already flipped the row to 'pending'; leaving it there
    // would strand it with no writer, no sheet and no recovery path.
    expect(services.message.finalizeAssistantMessage).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            expect.objectContaining({ state: 'output-error' }),
            expect.objectContaining({ type: 'data-error' }),
          ],
        },
        status: 'error',
      }),
    );
    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(backgroundReply.clearTopic).toHaveBeenCalledWith('topic-1');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('does not settle the row when the decision itself failed', async () => {
    const services = createServices();
    services.message.applyToolApprovalDecisions = jest.fn(async () => {
      throw new Error('database is locked');
    });
    const runtime = createRuntime({ services });
    const errorSpy = jest.spyOn(loggerService, 'error').mockImplementation(() => undefined);

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('database is locked');

    // Nothing was written, so the row still carries the request and the sheet can retry.
    expect(services.message.finalizeAssistantMessage).not.toHaveBeenCalled();
    // And nothing was attempted either: with no settled message there is no row
    // to write, and a runtime that tried anyway would only look clean because
    // settleFailedTurn swallows the resulting crash into this log line.
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist the terminal state of a failed turn'),
      expect.anything(),
    );
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');

    errorSpy.mockRestore();
  });

  test('does not open a new topic when aborted after topic creation', async () => {
    const services = createServices();
    const openTopic = jest.fn();
    const runtime = createRuntime({ openTopic, services });
    // 话题已经建出来、这一轮还没发布出去的那个窗口。挂在附件落盘上，因为它是话题创建之后、
    // 乐观发布之前唯一一个 await 点——导航如今就挂在那次发布上。
    const partsGate = createDeferred();
    mockCreateMessageParts.mockImplementationOnce(async (parts: readonly CherryMessagePart[]) => {
      await partsGate.promise;
      return { entries: [], parts: [...parts] };
    });

    const sendPromise = runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first',
    });

    await waitUntil(() => mockCreateMessageParts.mock.calls.length > 0);
    runtime.abort(NEW_TOPIC_SNAPSHOT_KEY);
    partsGate.resolve();
    await sendPromise;

    expect(openTopic).not.toHaveBeenCalled();
    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status).toBe('idle');
  });

  test('rejects a second turn for the same topic', async () => {
    const services = createServices();
    const topicGate = createDeferred();
    services.topic.getById = jest.fn(async () => {
      await topicGate.promise;
      return createTopic();
    });
    mockReadUIMessageStream.mockImplementation(() =>
      asyncIterable([createUiMessage('assistant-1', 'done')]),
    );
    const runtime = createRuntime({ services });

    const firstTurn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first',
      topicId: 'topic-1',
    });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'reserving');

    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'second',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('A response is already streaming for this topic.');

    topicGate.resolve();
    await firstTurn;
    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledTimes(1);
  });

  test('runs turns for different topics in parallel', async () => {
    const services = createServices();
    const topicGate = createDeferred();
    services.topic.getById = jest.fn(async (topicId: string) => {
      await topicGate.promise;
      return createTopic({ id: topicId });
    });
    mockReadUIMessageStream.mockImplementation(() =>
      asyncIterable([createUiMessage('assistant-1', 'done')]),
    );
    const runtime = createRuntime({ services });

    const firstTurn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first',
      topicId: 'topic-1',
    });
    const secondTurn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'second',
      topicId: 'topic-2',
    });

    await waitUntil(
      () =>
        runtime.getTopicSnapshot('topic-1').status === 'reserving' &&
        runtime.getTopicSnapshot('topic-2').status === 'reserving',
    );
    topicGate.resolve();
    await Promise.all([firstTurn, secondTurn]);

    expect(services.ai.streamText).toHaveBeenCalledTimes(2);
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
    expect(runtime.getTopicSnapshot('topic-2').status).toBe('idle');
  });

  test('keeps a turn running when a route subscriber unmounts', async () => {
    const services = createServices();
    const streamGate = createDeferred();
    mockReadUIMessageStream.mockImplementation(() =>
      gatedAsyncIterable([createUiMessage('assistant-1', 'streaming')], streamGate.promise),
    );
    const runtime = createRuntime({ services });
    const unsubscribeRoute = runtime.subscribe(jest.fn());

    const turn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'continue after unmount',
      topicId: 'topic-1',
    });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    const signal = (services.ai.streamText as jest.Mock).mock.calls[0][0].requestOptions
      .signal as AbortSignal;

    unsubscribeRoute();

    expect(signal.aborted).toBe(false);
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('streaming');
    streamGate.resolve();
    await turn;
  });

  test('restores the current snapshot after a route resubscribes', async () => {
    const services = createServices();
    const streamGate = createDeferred();
    mockReadUIMessageStream.mockImplementation(() =>
      gatedAsyncIterable([createUiMessage('assistant-1', 'streaming')], streamGate.promise),
    );
    const runtime = createRuntime({ services });
    const unsubscribeFirstRoute = runtime.subscribe(jest.fn());

    const turn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'restore me',
      topicId: 'topic-1',
    });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    unsubscribeFirstRoute();

    const nextRouteListener = jest.fn();
    const unsubscribeNextRoute = runtime.subscribe(nextRouteListener);
    expect(runtime.getTopicSnapshot('topic-1')).toEqual(
      expect.objectContaining({
        overlayMessage: expect.objectContaining({
          data: { parts: [{ type: 'text', text: 'streaming' }] },
          id: 'assistant-1',
        }),
        status: 'streaming',
      }),
    );

    streamGate.resolve();
    await turn;
    expect(nextRouteListener).toHaveBeenCalledWith({
      topicId: 'topic-1',
      type: 'snapshot-changed',
    });
    unsubscribeNextRoute();
  });

  test('aborts and pauses an execution after its upstream stream stays idle', async () => {
    const services = createServices();
    let requestSignal: AbortSignal | undefined;
    services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
      requestSignal = request.requestOptions.signal;
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          request.requestOptions.signal.addEventListener('abort', () => controller.close(), {
            once: true,
          });
        },
      });
    });
    services.ai.readMessageStream = jest.fn(accumulateTextChunks);
    const runtime = createRuntime({ config: { idleTimeoutMs: 10 }, services });

    await runtime.sendText({ text: 'wait', topicId: 'topic-1' });

    expect(requestSignal?.aborted).toBe(true);
    expect((requestSignal?.reason as DOMException).name).toBe('TimeoutError');
    expect(services.message.finalizeAssistantMessage).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({ status: 'paused' }),
    );
  });

  test('extends the idle window while an upstream tool approval is pending', async () => {
    const services = createServices();
    const source = createControllableChunkStream();
    let requestSignal: AbortSignal | undefined;
    services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
      requestSignal = request.requestOptions.signal;
      return source.stream;
    });
    services.ai.readMessageStream = jest.fn(accumulateTextChunks);
    const runtime = createRuntime({
      config: { approvalIdleTimeoutMs: 100, idleTimeoutMs: 10 },
      services,
    });

    const send = runtime.sendText({ text: 'approve', topicId: 'topic-1' });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    source.push({
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      type: 'tool-approval-request',
    } as UIMessageChunk);
    await delay(25);
    expect(requestSignal?.aborted).toBe(false);

    source.close();
    await send;
  });

  test('persists steers immediately and answers them in FIFO order after clean step boundaries', async () => {
    const services = createServices();
    configureDynamicReservation(services);
    services.message.getPathToNode = jest.fn(async (id: string) => {
      const text = id.includes('turn-2')
        ? 'steer one'
        : id.includes('turn-3')
          ? 'steer two'
          : 'initial';
      return [
        {
          ...createMessage(id, 'user'),
          data: { parts: [{ type: 'text', text } as CherryMessagePart] },
        },
      ];
    });
    const initialGate = createDeferred();
    const firstSteerGate = createDeferred();
    let streamIndex = 0;
    mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) => {
      streamIndex += 1;
      if (streamIndex === 1) {
        return gatedAsyncIterable(
          [createUiMessage(message.id, 'initial response')],
          initialGate.promise,
        );
      }
      if (streamIndex === 2) {
        return gatedAsyncIterable(
          [createUiMessage(message.id, 'first redirect')],
          firstSteerGate.promise,
        );
      }
      return asyncIterable([createUiMessage(message.id, 'second redirect')]);
    });
    const runtime = createRuntime({ services });

    const initialSend = runtime.sendText({ text: 'initial', topicId: 'topic-1' });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    await runtime.steer({ payload: createFollowUpPayload('steer one'), topicId: 'topic-1' });
    await runtime.steer({ payload: createFollowUpPayload('steer two'), topicId: 'topic-1' });

    const reservations = (services.message.createUserMessageWithPlaceholders as jest.Mock).mock
      .calls;
    expect(reservations).toHaveLength(3);
    expect(reservations[1][0].placeholders).toEqual([]);
    expect(reservations[1][0].userMessage.dto.data.parts).toEqual([
      { type: 'text', text: 'steer one' },
    ]);
    expect(reservations[2][0].userMessage.dto.data.parts).toEqual([
      { type: 'text', text: 'steer two' },
    ]);
    const initialRequest = (services.ai.streamText as jest.Mock).mock.calls[0][0];
    expect(initialRequest.shouldYield()).toBe(true);
    expect(services.ai.streamText).toHaveBeenCalledTimes(1);

    initialGate.resolve();
    await waitUntil(() => (services.ai.streamText as jest.Mock).mock.calls.length === 2);
    const firstSteerRequest = (services.ai.streamText as jest.Mock).mock.calls[1][0];
    expect(readLastText(firstSteerRequest.messages)).toContain('steer one');
    expect(readLastText(firstSteerRequest.messages)).toContain('<system-reminder>');
    expect(firstSteerRequest.shouldYield()).toBe(true);
    expect(services.ai.streamText).toHaveBeenCalledTimes(2);

    firstSteerGate.resolve();
    await initialSend;
    expect(services.ai.streamText).toHaveBeenCalledTimes(3);
    const secondSteerRequest = (services.ai.streamText as jest.Mock).mock.calls[2][0];
    expect(readLastText(secondSteerRequest.messages)).toContain('steer two');
    expect(secondSteerRequest.shouldYield()).toBe(false);
  });

  test('drains queued follow-ups one per successful topic completion', async () => {
    const services = createServices();
    configureDynamicReservation(services);
    const gates = [createDeferred(), createDeferred(), createDeferred()];
    let streamIndex = 0;
    mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) => {
      const gate = gates[streamIndex];
      streamIndex += 1;
      return gatedAsyncIterable(
        [createUiMessage(message.id, `response ${streamIndex}`)],
        gate.promise,
      );
    });
    const runtime = createRuntime({ services });
    const queuedModelId = 'queued-provider::queued-model' as UniqueModelId;

    const initialSend = runtime.sendText({ text: 'initial', topicId: 'topic-1' });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    await runtime.queueFollowUp({
      payload: createFollowUpPayload('queued one', {
        fastMode: true,
        mentionedModels: [queuedModelId],
        reasoningEffort: 'high',
      }),
      topicId: 'topic-1',
    });
    await runtime.queueFollowUp({
      payload: createFollowUpPayload('queued two'),
      topicId: 'topic-1',
    });

    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledTimes(1);
    expect(runtime.getTopicSnapshot('topic-1').queuedMessages).toHaveLength(2);

    gates[0].resolve();
    await waitUntil(
      () =>
        (services.message.createUserMessageWithPlaceholders as jest.Mock).mock.calls.length === 2,
    );
    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledTimes(2);
    expect(runtime.getTopicSnapshot('topic-1').queuedMessages).toHaveLength(1);
    const firstQueuedReservation = (services.message.createUserMessageWithPlaceholders as jest.Mock)
      .mock.calls[1][0];
    expect(firstQueuedReservation.userMessage.dto.data.parts).toEqual([
      { type: 'text', text: 'queued one' },
    ]);
    expect(firstQueuedReservation.placeholders[0]).toEqual(
      expect.objectContaining({
        modelId: queuedModelId,
        data: { parts: [], turnOptions: { fastMode: true, reasoningEffort: 'high' } },
      }),
    );

    gates[1].resolve();
    await waitUntil(
      () =>
        (services.message.createUserMessageWithPlaceholders as jest.Mock).mock.calls.length === 3,
    );
    expect(runtime.getTopicSnapshot('topic-1').queuedMessages).toBeUndefined();
    expect(
      (services.message.createUserMessageWithPlaceholders as jest.Mock).mock.calls[2][0].userMessage
        .dto.data.parts,
    ).toEqual([{ type: 'text', text: 'queued two' }]);

    gates[2].resolve();
    await initialSend;
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('retains queued follow-ups without launching them after a failed turn', async () => {
    const services = createServices();
    configureDynamicReservation(services);
    const streamGate = createDeferred();
    mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) =>
      gatedFailingAsyncIterable(
        [createUiMessage(message.id, 'partial')],
        streamGate.promise,
        new Error('provider failed'),
      ),
    );
    const runtime = createRuntime({ services });

    const initialSend = runtime.sendText({ text: 'initial', topicId: 'topic-1' });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    await runtime.queueFollowUp({
      payload: createFollowUpPayload('keep queued'),
      topicId: 'topic-1',
    });
    streamGate.resolve();
    await initialSend;

    expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledTimes(1);
    expect(runtime.getTopicSnapshot('topic-1')).toEqual(
      expect.objectContaining({
        queuedMessages: [expect.objectContaining({ text: 'keep queued' })],
        status: 'idle',
      }),
    );
  });

  test('aborts and awaits active turns before completing dispose', async () => {
    const services = createServices();
    const finalizationStarted = createDeferred();
    const finalizationGate = createDeferred();
    let streamSignal: AbortSignal | undefined;
    services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
      streamSignal = request.requestOptions.signal;
      return new ReadableStream<UIMessageChunk>();
    });
    services.message.finalizeAssistantMessage = jest.fn(async (_id, input) => {
      finalizationStarted.resolve();
      await finalizationGate.promise;
      return {
        ...createMessage('assistant-1', 'assistant'),
        data: input.data,
        status: input.status,
      };
    });
    mockReadUIMessageStream.mockImplementation(() =>
      abortableAsyncIterable(
        createUiMessage('assistant-1', 'streaming'),
        streamSignal as AbortSignal,
      ),
    );
    const runtime = createRuntime({ services });

    const turn = runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'stop on shutdown',
      topicId: 'topic-1',
    });
    await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
    const signal = (services.ai.streamText as jest.Mock).mock.calls[0][0].requestOptions
      .signal as AbortSignal;

    const disposePromise = runtime._doStop();
    let disposeCompleted = false;
    void disposePromise.then(() => {
      disposeCompleted = true;
    });
    await finalizationStarted.promise;

    expect(signal.aborted).toBe(true);
    expect(disposeCompleted).toBe(false);
    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'too late',
        topicId: 'topic-2',
      }),
    ).rejects.toThrow('Chat runtime is disposed.');

    finalizationGate.resolve();
    await Promise.all([turn, disposePromise]);

    expect(disposeCompleted).toBe(true);
    // The memoized `dispose()` promise went with the method: `stopAll` runs once
    // per host, so a repeated stop only has to be harmless.
    await expect(runtime._doStop()).resolves.toBeUndefined();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  describe('resource scopes', () => {
    const TOPIC = { id: 'topic-1', kind: 'topic' } as const;

    test('deleting a topic aborts its live turn and lands the terminal write first', async () => {
      const services = createServices();
      const backgroundReply = createBackgroundReplyLifecycle();
      let streamSignal: AbortSignal | undefined;
      services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
        streamSignal = request.requestOptions.signal;
        return new ReadableStream<UIMessageChunk>();
      });
      mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) =>
        abortableAsyncIterable(createUiMessage(message.id, 'partial'), streamSignal!),
      );
      const runtime = createRuntime({ backgroundReply, services });

      const turn = runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'hi',
        topicId: 'topic-1',
      });
      await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');

      let finalizedBeforeMutation = false;
      await scopes.delete([TOPIC], async () => {
        // Read inside the mutation: this is the whole guarantee. By the time the
        // delete transaction would open, the aborted turn has already written
        // its terminal row, so it cannot write into a topic that is gone.
        finalizedBeforeMutation =
          (services.message.finalizeAssistantMessage as jest.Mock).mock.calls.length > 0;
        expect(backgroundReply.clearTopic).toHaveBeenCalledWith('topic-1');
      });

      expect(finalizedBeforeMutation).toBe(true);
      await turn;
      expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
    });

    test('refuses a send into a topic that is being deleted', async () => {
      const services = createServices();
      const runtime = createRuntime({ services });
      const mutation = createDeferred();

      const deletion = scopes.delete([TOPIC], () => mutation.promise);
      await waitUntil(() => scopes.listActive(TOPIC).length === 0);

      await expect(
        runtime.sendText({
          selectedModelId: 'provider::model' as UniqueModelId,
          text: 'hi',
          topicId: 'topic-1',
        }),
      ).rejects.toThrow(ScopeFencedError);
      // Refused before anything was reserved — no row is left behind in a topic
      // that is about to disappear.
      expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();

      mutation.resolve();
      await deletion;
    });

    test('drops queued follow-ups so no new turn starts inside the cancelled task', async () => {
      const services = createServices();
      configureDynamicReservation(services);
      let streamSignal: AbortSignal | undefined;
      services.ai.streamText = jest.fn(async (request: ChatStreamRequest) => {
        streamSignal = request.requestOptions.signal;
        return new ReadableStream<UIMessageChunk>();
      });
      mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) =>
        abortableAsyncIterable(createUiMessage(message.id, 'partial'), streamSignal!),
      );
      const runtime = createRuntime({ services });

      const turn = runtime.sendText({ text: 'initial', topicId: 'topic-1' });
      await waitUntil(() => runtime.getTopicSnapshot('topic-1').status === 'streaming');
      await runtime.queueFollowUp({
        payload: createFollowUpPayload('should never run'),
        topicId: 'topic-1',
      });

      await scopes.delete([TOPIC], async () => undefined);
      await turn;

      // Aborting alone leaves the follow-up queued — the failure-path test above
      // pins exactly that. Cancelling the scope has to drop it too, or it sits
      // there waiting for a topic that no longer exists.
      expect(runtime.getTopicSnapshot('topic-1').queuedMessages).toBeUndefined();
      expect(services.message.createUserMessageWithPlaceholders).toHaveBeenCalledTimes(1);
    });

    test('registers a new-topic turn under the id it creates, not only the sentinel', async () => {
      const services = createServices();
      const streamGate = createDeferred();
      mockReadUIMessageStream.mockImplementation(({ message }: { message: CherryUIMessage }) =>
        gatedAsyncIterable([createUiMessage(message.id, 'partial')], streamGate.promise),
      );
      const runtime = createRuntime({ services });

      const turn = runtime.sendNewTopicText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'hi',
      });
      await waitUntil(
        () => runtime.getTopicSnapshot(NEW_TOPIC_SNAPSHOT_KEY).status === 'streaming',
      );

      // The task started before the topic existed, so without the handoff
      // binding a delete naming the created id would find nothing to cancel.
      expect(scopes.listActive(TOPIC)).toHaveLength(1);

      streamGate.resolve();
      await turn;
      expect(scopes.listActive(TOPIC)).toHaveLength(0);
    });
  });
});

function asyncIterable<T>(items: T[]) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }
  })();
}

function accumulateTextChunks(input: {
  message: CherryUIMessage;
  stream: ReadableStream<UIMessageChunk>;
}): AsyncIterable<CherryUIMessage> {
  return (async function* () {
    const reader = input.stream.getReader();
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value.type !== 'text-delta') continue;
        text += value.delta;
        yield createUiMessage(input.message.id, text);
      }
    } finally {
      reader.releaseLock();
    }
  })();
}

function createControllableChunkStream() {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  return {
    close() {
      controller.close();
    },
    push(chunk: UIMessageChunk) {
      controller.enqueue(chunk);
    },
    stream: new ReadableStream<UIMessageChunk>({
      start(nextController) {
        controller = nextController;
      },
    }),
  };
}

/** Yields `items`, then stalls until `gate` settles, keeping the turn streaming. */
function gatedAsyncIterable<T>(items: T[], gate: Promise<void>) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }

    await gate;
  })();
}

function gatedFailingAsyncIterable<T>(items: T[], gate: Promise<void>, error: Error) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }

    await gate;
    throw error;
  })();
}

function abortableAsyncIterable<T>(item: T, signal: AbortSignal) {
  return (async function* () {
    yield item;
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }

      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  })();
}

function failingAsyncIterable(error: Error): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          throw error;
        },
      };
    },
  };
}

function asyncIterableWithFailure<T>(items: T[], error: Error) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }

    throw error;
  })();
}

function createDeferred<T = void>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function createDeferredInvalidation() {
  const deferred = createDeferred();
  // 第一次调用放行、第二次卡住，把测试停在两次失效通知之间的那个窗口。
  const blockOnCall = 2;
  let callCount = 0;

  return {
    fn: jest.fn(async () => {
      callCount += 1;

      if (callCount < blockOnCall) {
        return;
      }

      await deferred.promise;
    }),
    get callCount() {
      return callCount;
    },
    resolve: deferred.resolve,
  };
}

function createFollowUpPayload(
  text: string,
  patch: Partial<ComposerQueuedMessagePayload> = {},
): ComposerQueuedMessagePayload {
  return {
    text,
    userMessageParts: [{ type: 'text', text } as CherryMessagePart],
    ...patch,
  };
}

function readLastText(messages: readonly CherryUIMessage[]): string {
  const last = messages.at(-1);
  return (last?.parts ?? [])
    .filter((part): part is Extract<CherryMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

async function waitUntil(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error('Timed out waiting for condition.');
}

function createRuntime(input: {
  backgroundReply?: BackgroundReplyLifecycle;
  config?: Partial<ChatRuntimeConfig>;
  invalidateTopicMessages?: (topicId: string) => Promise<void>;
  invalidateTopics?: () => Promise<void>;
  openTopic?: (topicId: string) => void;
  services: ChatRuntimeServices;
}) {
  const runtime = new ChatRuntime(
    // The container injects `AiService` here to build the production dependency
    // set; this suite supplies that set whole, so the slot is never read.
    undefined as never,
    input.backgroundReply ?? createBackgroundReplyLifecycle(),
    {
      backgroundReply: input.backgroundReply ?? createBackgroundReplyLifecycle(),
      files: {
        createParts: (parts) => mockCreateMessageParts(parts),
        discard: (...args) => mockDiscardInternalEntries(...args),
      },
      services: input.services,
    },
    input.config,
  );
  runtime.subscribe(async (event) => {
    switch (event.type) {
      case 'invalidate-topic-messages':
        await input.invalidateTopicMessages?.(event.topicId);
        break;
      case 'invalidate-topics':
        await input.invalidateTopics?.();
        break;
      case 'open-topic':
        input.openTopic?.(event.topicId);
        break;
      case 'snapshot-changed':
        break;
    }
  });
  return runtime;
}

function createBackgroundReplyLifecycle(
  turn: BackgroundReplyTurn = createBackgroundReplyTurn(),
): BackgroundReplyLifecycle {
  return {
    clearSession: jest.fn(),
    clearTopic: jest.fn(),
    startTurn: jest.fn(() => turn),
  };
}

function createBackgroundReplyTurn(): BackgroundReplyTurn {
  return {
    awaitApproval: jest.fn(),
    finish: jest.fn(),
    update: jest.fn(),
  };
}

function createServices() {
  const userMessage = createMessage('user-1', 'user');
  const assistantMessage = createMessage('assistant-1', 'assistant');
  const model = createModel();
  let mintedIdSequence = 0;
  const finalizeAssistantMessage = jest.fn(
    async (
      _id: string,
      input: Parameters<ChatRuntimeServices['message']['finalizeAssistantMessage']>[1],
    ) => ({
      ...assistantMessage,
      data: input.data,
      stats: input.runtimeStats ?? assistantMessage.stats,
      status: input.status,
    }),
  );

  return {
    ai: {
      generateText: jest.fn(),
      readMessageStream: jest.fn((input) => mockReadUIMessageStream(input)),
      streamText: jest.fn(async () => new ReadableStream()),
    },
    assistant: {
      getById: jest.fn(async (id: string) => createAssistant(id, model.id)),
    },
    message: {
      applyToolApprovalDecisions: jest.fn(async () => ({
        alreadySettledApprovalIds: [],
        appliedApprovalIds: ['approval-1'],
        parts: [createRespondedApprovalPart('approval-1')],
      })),
      createUserMessageWithPlaceholders: jest.fn(async () => ({
        placeholders: [assistantMessage],
        userMessage,
      })),
      delete: jest.fn(async () => ({
        deletedIds: ['user-1', 'assistant-1'],
        newActiveNodeId: 'active-node',
      })),
      finalizeAssistantMessage,
      getById: jest.fn(async () => assistantMessage),
      getChildrenByParentId: jest.fn(async () => []),
      getPathToNode: jest.fn(async () => [userMessage]),
      getPathThrough: jest.fn(async () => [userMessage, assistantMessage]),
      // 确定性的铸币机：真实实现是 uuidv7，测试只需要「每次不同、可预期」。
      newMessageId: jest.fn(() => `minted-${(mintedIdSequence += 1)}`),
      updateSiblingsGroupId: jest.fn(async () => undefined),
    },
    model: {
      getById: jest.fn(async () => model),
    },
    preference: {
      get: jest.fn(async () => model.id),
    },
    provider: {
      getByProviderId: jest.fn(async () => ({ authMethods: ['api-key'] })),
    },
    topic: {
      create: jest.fn(async () => ({
        ...createTopic(),
        activeNodeId: undefined,
        name: 'first message from empty topic',
      })),
      getById: jest.fn(async () => createTopic()),
      setActiveNode: jest.fn(async (_topicId: string, nodeId: string) => ({
        activeNodeId: nodeId,
      })),
      update: jest.fn(async () => createTopic()),
    },
  } as unknown as ChatRuntimeServices;
}

function configureDynamicReservation(services: ChatRuntimeServices) {
  const messages = new Map<string, Message>();
  const getById = services.message.getById.bind(services.message);
  let reservationCount = 0;
  services.model.getById = jest.fn(async (id: string) => createModel(id as UniqueModelId));
  services.message.createUserMessageWithPlaceholders = jest.fn(async (input) => {
    reservationCount += 1;
    const turnSuffix = reservationCount === 1 ? '' : `-turn-${reservationCount}`;
    const userMessage =
      input.userMessage.mode === 'existing'
        ? await services.message.getById(input.userMessage.id)
        : {
            ...createMessage(`user-reserved${turnSuffix}`, 'user'),
            data: input.userMessage.dto.data,
            modelId: input.userMessage.dto.modelId ?? null,
            parentId: input.userMessage.dto.parentId ?? 'active-node',
            siblingsGroupId: input.userMessage.dto.siblingsGroupId ?? 0,
          };
    const placeholders = input.placeholders.map((placeholder, index) => {
      const message = {
        ...createMessage(`assistant-reserved-${index + 1}${turnSuffix}`, 'assistant'),
        data: placeholder.data,
        messageSnapshot: placeholder.messageSnapshot ?? null,
        modelId: placeholder.modelId ?? null,
        parentId: userMessage.id,
        siblingsGroupId: input.siblingsGroupId ?? 0,
      };
      messages.set(message.id, message);
      return message;
    });
    messages.set(userMessage.id, userMessage);
    return { placeholders, userMessage };
  });
  services.message.getById = jest.fn(async (id: string) => messages.get(id) ?? getById(id));
  services.message.finalizeAssistantMessage = jest.fn(async (id, input) => {
    const message = messages.get(id) ?? createMessage(id, 'assistant');
    const finalized = {
      ...message,
      data: input.data,
      stats: input.runtimeStats ?? message.stats,
      status: input.status,
    };
    messages.set(id, finalized);
    return finalized;
  });
}

function createTopic(patch: Partial<ReturnType<typeof createTopicBase>> = {}) {
  return {
    ...createTopicBase(),
    ...patch,
  };
}

function createTopicBase() {
  return {
    activeNodeId: 'active-node',
    assistantId: 'assistant-1',
    createdAt: '2026-05-15T00:00:00.000Z',
    id: 'topic-1',
    isNameManuallyEdited: false,
    name: 'Topic',
    orderKey: 'a0',
    updatedAt: '2026-05-15T00:00:00.000Z',
  };
}

function createUiMessage(id: string, text: string): CherryUIMessage {
  return {
    id,
    parts: [{ type: 'text', text }],
    role: 'assistant',
  } as CherryUIMessage;
}

function createApprovalPart(approvalId: string): CherryMessagePart {
  return {
    approval: { id: approvalId },
    input: { q: 'x' },
    state: 'approval-requested',
    toolCallId: `call-${approvalId}`,
    toolName: 'search',
    type: 'dynamic-tool',
  } as unknown as CherryMessagePart;
}

function createRespondedApprovalPart(approvalId: string): CherryMessagePart {
  return {
    approval: { approved: true, id: approvalId },
    input: { q: 'x' },
    state: 'approval-responded',
    toolCallId: `call-${approvalId}`,
    toolName: 'search',
    type: 'dynamic-tool',
  } as unknown as CherryMessagePart;
}

function createFilePart(url: string): CherryMessagePart {
  return {
    filename: url.split('/').pop() ?? 'File',
    mediaType: 'application/pdf',
    type: 'file',
    url,
  } as CherryMessagePart;
}

function createFileEntry(): FileEntry {
  return FileEntrySchema.parse({
    createdAt: 1,
    filename: 'brief.pdf',
    id: '00000000-0000-7000-8000-000000000001',
    mediaType: 'application/pdf',
    size: 12,
    updatedAt: 1,
  });
}

function createMessage(id: string, role: Message['role']): Message {
  const now = '2026-05-15T00:00:00.000Z';

  return {
    createdAt: now,
    data: { parts: [] },
    id,
    modelId: role === 'assistant' ? ('provider::model' as UniqueModelId) : null,
    messageSnapshot: null,
    parentId: role === 'assistant' ? 'user-1' : 'active-node',
    role,
    searchableText: '',
    siblingsGroupId: 0,
    status: role === 'assistant' ? 'pending' : 'success',
    topicId: 'topic-1',
    updatedAt: now,
  };
}

function createAssistant(id: string, modelId: UniqueModelId | null): Assistant {
  const now = '2026-05-15T00:00:00.000Z';

  return {
    createdAt: now,
    description: '',
    emoji: '🌟',
    id,
    mcpServerIds: [],
    modelId,
    modelName: modelId,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    updatedAt: now,
  };
}

function createModel(id: UniqueModelId = 'provider::model' as UniqueModelId): Model {
  return {
    capabilities: [],
    id,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: id.split('::')[1] ?? 'model',
    name: 'Model',
    providerId: id.split('::')[0] ?? 'provider',
    supportsStreaming: true,
  };
}
