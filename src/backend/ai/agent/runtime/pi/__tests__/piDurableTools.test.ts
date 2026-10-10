import type { Context, JsonValue } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  AssistantEntry,
  createRegistry,
  Harness,
  MemoryStorage,
  ToolTask,
  type Conversation,
  type Extension,
  type TaskId,
} from '@earendil-works/pi-durable';

import type { RuntimeTool } from '../../types';
import { createPiDurableToolExtension } from '../piDurableTools';
import { emptyAssistantMessage } from '../piStreamEvents';

/** Preserve the same durable records across Harness instances, as a reopened SQL adapter does. */
class ReopenableMemoryStorage extends MemoryStorage {
  override async close(): Promise<void> {}
}

function cancelled(context: Context): Promise<never> {
  return new Promise((_, reject) => {
    const signal = context.abortSignal;
    if (!signal) throw new Error('Expected task cancellation');
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function capability(overrides: Partial<RuntimeTool> = {}): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: 'create_file' },
    providerName: 'create_file',
    displayName: 'Create file',
    description: 'Create one file.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    approval: 'ask',
    execute: async () => ({ value: 'Created', artifacts: [] }),
    ...overrides,
  };
}

function capabilityExtension(
  options: Omit<Parameters<typeof createPiDurableToolExtension>[0], 'resolve'>,
) {
  return createPiDurableToolExtension({
    ...options,
    resolve: async (tool) => ({ tool, turnId: 'turn' }),
  });
}

async function open(storage: MemoryStorage, extension: Extension) {
  const registry = createRegistry();
  registry.install(extension);
  return Harness.open(
    storage,
    {
      registry,
      models: createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
      }),
    },
    BACKGROUND_CONTEXT,
  );
}

async function toolTask(
  conversation: Conversation,
  name = 'create_file',
  args: Record<string, JsonValue> = { name: 'note.txt' },
  callId = 'call',
): Promise<TaskId> {
  return conversation.commit(async (tx) => {
    const message = emptyAssistantMessage({
      api: 'cherry',
      provider: 'provider',
      id: 'model',
      name: 'Model',
      baseUrl: '',
      contextWindow: 32768,
      maxTokens: 4096,
      input: ['text'],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
    const assistant = await tx.appendEntry(AssistantEntry, conversation.id, {
      model: [
        {
          ...message,
          stopReason: 'toolUse',
          content: [{ type: 'toolCall', id: callId, name, arguments: args }],
        },
      ],
    });
    return tx.createTask(
      ToolTask,
      { assistant: assistant.id, callId },
      { ownership: { kind: 'conversation' } },
    );
  }, BACKGROUND_CONTEXT);
}

describe('durable capability boundary', () => {
  test('MCP corrections do not ask for approval; a discovered valid dispatch preserves artifact details', async () => {
    const result = {
      value: 'Created',
      artifacts: [
        {
          ref: { kind: 'managed-file' as const, fileEntryId: 'file-id' },
          mediaType: 'text/plain',
          name: 'note.txt',
          kind: 'created' as const,
        },
      ],
    };
    const execute = jest.fn(async () => result);
    const approve = jest.fn(async () => true);
    const onResult = jest.fn();
    const extension = capabilityExtension({
      name: 'cherry',
      approve,
      onResult,
      tools: [
        capability({
          ref: { source: 'mcp', serverId: 'server', rawToolName: 'create_file' },
          providerName: 'mcp_create_file',
          execute,
        }),
      ],
    });
    const harness = await open(new MemoryStorage(), extension);
    try {
      const conversation = await harness.createConversation(
        { ownership: { kind: 'ownerless' }, agent: { extensions: [extension] } },
        BACKGROUND_CONTEXT,
      );
      const unseen = await toolTask(
        conversation,
        'tool_call',
        { name: 'mcp_create_file', params: { name: 'note.txt' } },
        'unseen',
      );
      await harness.waitForTask(unseen, BACKGROUND_CONTEXT);
      expect(approve).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      const search = await toolTask(conversation, 'tool_search', { query: '' }, 'search');
      await harness.waitForTask(search, BACKGROUND_CONTEXT);
      const invalid = await toolTask(
        conversation,
        'tool_call',
        { name: 'mcp_create_file', params: {} },
        'invalid',
      );
      await harness.waitForTask(invalid, BACKGROUND_CONTEXT);
      expect(approve).not.toHaveBeenCalled();
      const valid = await toolTask(
        conversation,
        'tool_call',
        { name: 'mcp_create_file', params: { name: 'note.txt' } },
        'valid',
      );
      await harness.waitForTask(valid, BACKGROUND_CONTEXT);
      expect(approve).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { name: 'note.txt' },
          turnId: 'turn',
          toolCallId: 'valid',
        }),
      );
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ providerName: 'mcp_create_file' }),
        result,
        expect.anything(),
        expect.objectContaining({ abortSignal: expect.anything() }),
      );
      expect((await conversation.context(BACKGROUND_CONTEXT)).messages.at(-1)).toMatchObject({
        role: 'toolResult',
        isError: false,
        details: {
          kind: 'cherry.tool-result',
          ref: { source: 'mcp', serverId: 'server', rawToolName: 'create_file' },
          output: result,
        },
      });
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });

  test('a pre-intent interruption asks for fresh approval after recovery', async () => {
    const storage = new ReopenableMemoryStorage();
    let asked!: () => void;
    const pending = new Promise<void>((resolve) => {
      asked = resolve;
    });
    const execute = jest.fn(async () => ({ value: 'Created', artifacts: [] }));
    const firstExtension = capabilityExtension({
      name: 'cherry',
      tools: [capability({ execute })],
      approve: async (_tool, _input, _call, _api, context) => {
        asked();
        return cancelled(context);
      },
    });
    const first = await open(storage, firstExtension);
    const conversation = await first.createConversation(
      { ownership: { kind: 'ownerless' }, agent: { extensions: [firstExtension] } },
      BACKGROUND_CONTEXT,
    );
    const id = await toolTask(conversation);
    first.resume();
    await pending;
    await first.close(BACKGROUND_CONTEXT);
    const approve = jest.fn(async () => true);
    const reopened = await open(
      storage,
      capabilityExtension({
        name: 'cherry',
        tools: [capability({ execute })],
        approve,
      }),
    );
    try {
      await reopened.waitForTask(id, BACKGROUND_CONTEXT);
      expect(approve).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      await reopened.close(BACKGROUND_CONTEXT);
    }
  });

  test('waits for approval before persisting intent or performing an effect', async () => {
    const execute = jest.fn(async () => ({ value: 'Created', artifacts: [] }));
    let release!: (approved: boolean) => void;
    let entered!: () => void;
    const asked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const decision = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const extension = capabilityExtension({
      name: 'cherry',
      tools: [capability({ execute })],
      approve: async () => {
        entered();
        return decision;
      },
    });
    const harness = await open(new MemoryStorage(), extension);
    try {
      const conversation = await harness.createConversation(
        { ownership: { kind: 'ownerless' }, agent: { extensions: [extension] } },
        BACKGROUND_CONTEXT,
      );
      const id = await toolTask(conversation);
      harness.resume();
      await asked;
      expect(execute).not.toHaveBeenCalled();
      expect((await harness.getTask(id, BACKGROUND_CONTEXT))?.state).toMatchObject({
        checkpoint: { phase: 'call' },
      });
      release(false);
      await harness.waitForTask(id, BACKGROUND_CONTEXT);
      expect(execute).not.toHaveBeenCalled();
      const history = await conversation.context(BACKGROUND_CONTEXT);
      expect(history.messages.at(-1)).toMatchObject({ role: 'toolResult', isError: true });
    } finally {
      release(false);
      await harness.close(BACKGROUND_CONTEXT);
    }
  });

  test('does not repeat a side effect whose execution intent survived a process restart', async () => {
    const storage = new ReopenableMemoryStorage();
    let started!: () => void;
    const invoked = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execute = jest.fn(async ({ signal }: Parameters<RuntimeTool['execute']>[0]) => {
      started();
      return cancelled({ ...BACKGROUND_CONTEXT, abortSignal: signal });
    });
    const extension = capabilityExtension({
      name: 'cherry',
      tools: [capability({ execute })],
      approve: async () => true,
    });
    const first = await open(storage, extension);
    const conversation = await first.createConversation(
      { ownership: { kind: 'ownerless' }, agent: { extensions: [extension] } },
      BACKGROUND_CONTEXT,
    );
    const id = await toolTask(conversation);
    first.resume();
    await invoked;
    expect((await first.getTask(id, BACKGROUND_CONTEXT))?.state).toMatchObject({
      checkpoint: { phase: 'execute', replay: 'unsafe' },
    });
    await first.close(BACKGROUND_CONTEXT);
    const reopened = await open(storage, extension);
    try {
      await reopened.waitForTask(id, BACKGROUND_CONTEXT);
      expect(execute).toHaveBeenCalledTimes(1);
      const restored = await reopened.conversation(conversation.id, BACKGROUND_CONTEXT);
      expect((await restored!.context(BACKGROUND_CONTEXT)).messages.at(-1)).toMatchObject({
        role: 'toolResult',
        isError: true,
        content: [expect.objectContaining({ text: expect.stringContaining('interrupted') })],
      });
    } finally {
      await reopened.close(BACKGROUND_CONTEXT);
    }
  });
});
