import type { AiStreamRequest } from '@/ai/types/requests';
import type { DataServices } from '@/data/services/createDataServices';
import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/data/types/assistant';
import type { CherryMessagePart, CherryUIMessage, Message } from '@/data/types/message';
import type { Model, UniqueModelId } from '@/data/types/model';

import { ChatRuntime, newTopicRuntimeId } from '../ChatRuntime';

const mockReadUIMessageStream = jest.fn();

jest.mock('ai', () => ({
  readUIMessageStream: (...args: unknown[]) => mockReadUIMessageStream(...args),
}));

describe('ChatRuntime', () => {
  beforeEach(() => {
    mockReadUIMessageStream.mockReset();
  });

  test('reserves user and assistant messages before streaming and persists terminal assistant parts', async () => {
    const services = createServices();
    const invalidateTopicMessages = jest.fn(async () => undefined);
    const runtime = createRuntime({ invalidateTopicMessages, services });
    const assistantChunk = createUiMessage('assistant-1', 'hello');
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendText({
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
    expect(services.ai.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: 'assistant-1',
        chatId: 'topic-1',
        messageId: 'assistant-1',
        uniqueModelId: 'provider::model',
      }),
    );
    expect(services.message.update).toHaveBeenCalledWith('assistant-1', {
      data: { parts: assistantChunk.parts },
      status: 'success',
    });
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

    const updateMessage = services.message.update as jest.Mock;
    await waitUntil(() => updateMessage.mock.calls.length > 0);

    expect(runtime.getTopicSnapshot('topic-1')).toEqual(
      expect.objectContaining({
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

    const updateMessage = services.message.update as jest.Mock;
    await waitUntil(() => updateMessage.mock.calls.length > 0);

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

    expect(services.message.update).toHaveBeenLastCalledWith('assistant-1', {
      data: {
        parts: [
          expect.objectContaining({
            data: expect.objectContaining({ message: 'stream failed' }),
            type: 'data-error',
          }),
        ],
      },
      status: 'error',
    });
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
  });

  test('appends an error part when streaming fails after partial output', async () => {
    const services = createServices();
    const runtime = createRuntime({ services });
    const partialChunk = createUiMessage('assistant-1', 'partial');
    mockReadUIMessageStream.mockReturnValue(
      asyncIterableWithFailure([partialChunk], new Error('stream failed')),
    );

    await runtime.sendText({
      selectedModelId: 'provider::model' as UniqueModelId,
      text: 'hi',
      topicId: 'topic-1',
    });

    expect(services.message.update).toHaveBeenLastCalledWith('assistant-1', {
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
    });
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
    mockReadUIMessageStream.mockReturnValue(asyncIterable([assistantChunk]));

    await runtime.sendNewTopicText({
      parts: [createFilePart('file://brief.pdf')],
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
            data: { parts: [createFilePart('file://brief.pdf')] },
          }),
        }),
      }),
    );
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
    services.message.createUserMessageWithPlaceholders = jest.fn(async () => {
      throw new Error('reservation failed');
    });
    const runtime = createRuntime({ services });

    await expect(
      runtime.sendText({
        selectedModelId: 'provider::model' as UniqueModelId,
        text: 'hi',
        topicId: 'topic-1',
      }),
    ).rejects.toThrow('reservation failed');

    expect(services.ai.streamText).not.toHaveBeenCalled();
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
    services.ai.streamText = jest.fn(async (request: AiStreamRequest) => {
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

    await waitUntil(() => runtime.getTopicSnapshot(newTopicRuntimeId).status === 'streaming');
    expect(runtime.getTopicSnapshot(newTopicRuntimeId)).toEqual(
      expect.objectContaining({
        overlayMessage: expect.objectContaining({ id: 'assistant-1' }),
        status: 'streaming',
      }),
    );

    runtime.abort(newTopicRuntimeId);
    expect(runtime.getTopicSnapshot(newTopicRuntimeId).status).toBe('aborting');
    expect(
      (services.ai.streamText as jest.Mock).mock.calls[0][0].requestOptions.signal.aborted,
    ).toBe(true);

    streamDeferred.resolve(new ReadableStream());
    await sendPromise;
    expect(runtime.getTopicSnapshot(newTopicRuntimeId).status).toBe('idle');
    expect(runtime.getTopicSnapshot('topic-1').status).toBe('idle');
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
    runtime.abort(newTopicRuntimeId);
    invalidateTopics.resolve();
    await sendPromise;

    expect(openTopic).not.toHaveBeenCalled();
    expect(services.message.createUserMessageWithPlaceholders).not.toHaveBeenCalled();
    expect(runtime.getTopicSnapshot(newTopicRuntimeId).status).toBe('idle');
  });
});

function asyncIterable<T>(items: T[]) {
  return (async function* () {
    for (const item of items) {
      yield item;
    }
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
  services: DataServices;
}) {
  return new ChatRuntime({
    services: input.services,
    invalidateTopics: input.invalidateTopics ?? jest.fn(async () => undefined),
    invalidateTopicMessages:
      input.invalidateTopicMessages ?? jest.fn(async (_topicId: string) => undefined),
    openTopic: input.openTopic ?? jest.fn(),
  });
}

function createServices() {
  const userMessage = createMessage('user-1', 'user');
  const assistantMessage = createMessage('assistant-1', 'assistant');
  const model = createModel();

  return {
    ai: {
      streamText: jest.fn(async () => new ReadableStream()),
    },
    assistant: {
      getById: jest.fn(),
    },
    message: {
      createUserMessageWithPlaceholders: jest.fn(async () => ({
        placeholders: [assistantMessage],
        userMessage,
      })),
      delete: jest.fn(async () => ({
        deletedIds: ['user-1', 'assistant-1'],
        newActiveNodeId: 'active-node',
      })),
      getPathToNode: jest.fn(async () => [userMessage]),
      update: jest.fn(async (_id: string, dto: Partial<Message>) => ({
        ...assistantMessage,
        ...dto,
      })),
    },
    model: {
      getById: jest.fn(async () => model),
    },
    preference: {
      get: jest.fn(async () => model.id),
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
  } as unknown as DataServices;
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
    modelSnapshot: null,
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
