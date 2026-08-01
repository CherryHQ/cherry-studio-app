import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { PreparedInternalFile } from '@cherrystudio/universal/data/types/file';
import type {
  CherryMessagePart,
  CherryUIMessage,
  Message,
} from '@cherrystudio/universal/data/types/message';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';

import { NEW_CHAT_SESSION_TOPIC_ID } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ChatSessionServices, ChatStreamRequest } from '../ChatSessionDependencies';
import { ChatSessionImpl } from '../ChatSessionImpl';

const mockReadUIMessageStream = jest.fn();
const mockPrepareMessageParts = jest.fn(
  async (
    parts: readonly CherryMessagePart[],
  ): Promise<{ files: PreparedInternalFile[]; parts: CherryMessagePart[] }> => ({
    files: [],
    parts: [...parts],
  }),
);
const mockDiscardPreparedFiles = jest.fn();

describe('ChatSessionImpl', () => {
  beforeEach(() => {
    mockReadUIMessageStream.mockReset();
    mockPrepareMessageParts.mockClear();
    mockPrepareMessageParts.mockImplementation(async (parts: readonly CherryMessagePart[]) => ({
      files: [],
      parts: [...parts],
    }));
    mockDiscardPreparedFiles.mockReset();
  });

  test('reserves user and assistant messages before streaming and persists terminal assistant parts', async () => {
    const services = createServices();
    const invalidateTopicMessages = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopicMessages, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
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
      fastMode: false,
      reasoningEffort: 'high',
    });
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        chatId: 'topic-1',
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

  test('normalizes source-url citations into text part references on successful persistence', async () => {
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

    expect(services.message.finalizeAssistantMessage).toHaveBeenLastCalledWith(
      'assistant-1',
      expect.objectContaining({
        data: {
          parts: [
            expect.objectContaining({
              type: 'text',
              providerMetadata: {
                cherry: {
                  references: [
                    expect.objectContaining({
                      category: 'citation',
                      citationType: 'web',
                      content: {
                        source: 'ai-sdk',
                        results: [{ number: 1, url: 'https://source1.test', title: 'Source 1' }],
                      },
                    }),
                  ],
                },
              },
            }),
            assistantChunk.parts[1],
          ],
        },
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
    const preparedFile = {
      ext: 'pdf',
      id: '00000000-0000-7000-8000-000000000001',
      name: 'brief',
      size: 12,
      uri: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
    };
    mockPrepareMessageParts.mockResolvedValueOnce({
      files: [preparedFile],
      parts: [createFilePart(preparedFile.uri)],
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
    expect(mockDiscardPreparedFiles).not.toHaveBeenCalled();
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
    await waitUntil(
      () => runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID).status === 'streaming',
    );

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
      url: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
    } as CherryMessagePart;
    const preparedFile = {
      ext: 'pdf',
      id: '00000000-0000-7000-8000-000000000001',
      name: 'brief',
      size: 12,
      uri: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
    };
    mockPrepareMessageParts.mockResolvedValueOnce({
      files: [preparedFile],
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
        preparedFiles: [preparedFile],
        userMessage: expect.objectContaining({
          dto: expect.objectContaining({
            data: { parts: [managedPart] },
          }),
        }),
      }),
    );
    expect(mockDiscardPreparedFiles).not.toHaveBeenCalled();
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
    const preparedFile = {
      ext: 'pdf',
      id: '00000000-0000-7000-8000-000000000001',
      name: 'brief',
      size: 12,
      uri: 'file:///documents/files/00000000-0000-7000-8000-000000000001.pdf',
    };
    mockPrepareMessageParts.mockResolvedValueOnce({
      files: [preparedFile],
      parts: [createFilePart(preparedFile.uri)],
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
    expect(mockDiscardPreparedFiles).toHaveBeenCalledWith([preparedFile]);
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

    await waitUntil(
      () => runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID).status === 'streaming',
    );
    expect(runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID)).toEqual(
      expect.objectContaining({
        hasHistoryBeforePendingTurn: false,
        overlayMessage: expect.objectContaining({ id: 'assistant-1' }),
        status: 'streaming',
      }),
    );

    runtime.abort(NEW_CHAT_SESSION_TOPIC_ID);
    expect(runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID).status).toBe('aborting');
    expect(
      (services.ai.streamText as jest.Mock).mock.calls[0][0].requestOptions.signal.aborted,
    ).toBe(true);

    streamDeferred.resolve(new ReadableStream());
    await sendPromise;
    expect(runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID).status).toBe('idle');
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
      data: { parts: [createRespondedApprovalPart('approval-1')] },
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
    const runtime = createRuntime({ invalidateTopicMessages, services });
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
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'topic-1',
        messageId: 'assistant-1',
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
    const runtime = createRuntime({ services });

    await runtime.respondToolApproval({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      topicId: 'topic-1',
    });

    expect(services.message.getById).not.toHaveBeenCalled();
    expect(services.ai.streamText).not.toHaveBeenCalled();
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
    const runtime = createRuntime({ services });

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('The tool approval request was not found on the message.');

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');
  });

  test('reports a deleted approval message without starting a continuation', async () => {
    const services = createServices();
    services.message.applyToolApprovalDecisions = jest.fn(async () => null);
    const runtime = createRuntime({ services });

    await expect(
      runtime.respondToolApproval({
        approvalId: 'approval-1',
        approved: true,
        messageId: 'assistant-1',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('The tool approval message no longer exists.');

    expect(services.ai.streamText).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('awaiting-approval');
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

  test('falls back to the default model when the pinned resume model is gone', async () => {
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
    services.assistant.getById = jest.fn(async () => createAssistant('assistant-1', null));
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
    expect(mockPrepareMessageParts).not.toHaveBeenCalled();
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
    const runtime = createRuntime({ services });

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
    const invalidateTopics = createDeferredInvalidation({ blockOnCall: 1 });
    const openTopic = jest.fn();
    const runtime = createRuntime({
      invalidateTopics: invalidateTopics.fn,
      openTopic,
      services,
    });

    const sendPromise = runtime.sendNewTopicText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'first',
    });

    await waitUntil(() => invalidateTopics.callCount > 0);
    runtime.abort(NEW_CHAT_SESSION_TOPIC_ID);
    invalidateTopics.resolve();
    await sendPromise;

    expect(openTopic).not.toHaveBeenCalled();
    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot(NEW_CHAT_SESSION_TOPIC_ID).status).toBe('idle');
  });
});

function asyncIterable<T>(items: T[]) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }
  })();
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
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve,
  };
}

function createDeferredInvalidation(options: { blockOnCall?: number } = {}) {
  const deferred = createDeferred();
  const blockOnCall = options.blockOnCall ?? 2;
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
  invalidateTopicMessages?: (topicId: string) => Promise<void>;
  invalidateTopics?: () => Promise<void>;
  openTopic?: (topicId: string) => void;
  services: ChatSessionServices;
}) {
  const session = new ChatSessionImpl({
    files: {
      discard: (...args) => mockDiscardPreparedFiles(...args),
      prepareParts: (parts) => mockPrepareMessageParts(parts),
    },
    services: input.services,
  });
  session.subscribe(async (event) => {
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
  return session;
}

function createServices() {
  const userMessage = createMessage('user-1', 'user');
  const assistantMessage = createMessage('assistant-1', 'assistant');
  const model = createModel();
  const finalizeAssistantMessage = jest.fn(
    async (
      _id: string,
      input: Parameters<ChatSessionServices['message']['finalizeAssistantMessage']>[1],
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
      getPathToNode: jest.fn(async () => [userMessage]),
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
      update: jest.fn(async () => createTopic()),
    },
  } as unknown as ChatSessionServices;
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
    knowledgeBaseIds: [],
    mcpServerIds: [],
    modelId,
    modelName: modelId,
    name: 'Assistant',
    orderKey: 'a0',
    prompt: '',
    settings: DEFAULT_ASSISTANT_SETTINGS,
    tags: [],
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
