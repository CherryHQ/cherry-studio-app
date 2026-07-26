/**
 * Canaries for the AI SDK behaviours our MCP tool-approval flow rides on.
 *
 * The flow in `src/data/services/utils/toolApprovals.ts`,
 * `src/screens/ChatScreen/runtime/chatRuntimeMessages.ts` and `McpService`
 * owns no approval machinery of its own — it steers the SDK's. So the rules it
 * depends on are invisible in our source, and an `ai` upgrade that changes any
 * of them would surface as a provider 400 on a poisoned conversation branch
 * rather than as a failing build. These tests exist to fail in CI instead.
 *
 * They are deliberately black-box: real `streamText` / `convertToModelMessages`
 * against `MockLanguageModelV3`, nothing from `ai` mocked.
 */

import type { JSONObject } from '@ai-sdk/provider';
import {
  convertToModelMessages,
  dynamicTool,
  type ModelMessage,
  readUIMessageStream,
  streamText,
  type ToolModelMessage,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { z } from 'zod';

const TOOL_NAME = 'mcp__files__read';
const TOOL_CALL_ID = 'call-1';
const APPROVAL_ID = 'approval-1';
const TOOL_INPUT = { path: 'README.md' };
/** The shape `McpService.wrapTool` puts on a tool definition's `metadata`. */
const TOOL_METADATA = { cherry: { tool: { rawName: 'read_file', serverId: 's1' } } };

type DynamicToolUIPart = Extract<UIMessage['parts'][number], { type: 'dynamic-tool' }>;

describe('convertToModelMessages tool-approval states', () => {
  test('an approval-responded part yields an approval response but no tool result', async () => {
    // This asymmetry is the entire reason `finalizeDanglingToolApprovals`
    // exists: the model's tool call goes out with nothing answering it, and
    // the SDK's own `MissingToolResultsError` guard waves it through because
    // it only checks that *some* approval response exists, never `approved`.
    // Persisting this state therefore poisons the branch — the provider is the
    // first thing in the chain to notice, and it answers 400 from then on.
    const modelMessages = await convertToModelMessages([
      userMessage(),
      assistantMessage({
        approval: { approved: true, id: APPROVAL_ID },
        input: TOOL_INPUT,
        state: 'approval-responded',
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_NAME,
        type: 'dynamic-tool',
      }),
    ]);

    expect(assistantToolCalls(modelMessages)).toEqual([
      expect.objectContaining({ toolCallId: TOOL_CALL_ID, toolName: TOOL_NAME, type: 'tool-call' }),
    ]);
    expect(toolMessageParts(modelMessages)).toEqual([
      expect.objectContaining({
        approvalId: APPROVAL_ID,
        approved: true,
        type: 'tool-approval-response',
      }),
    ]);
    expect(toolResultsFor(modelMessages, TOOL_CALL_ID)).toEqual([]);
  });

  test('an output-denied part yields a tool result carrying the denial reason', async () => {
    const modelMessages = await convertToModelMessages([
      userMessage(),
      assistantMessage({
        approval: { approved: false, id: APPROVAL_ID, reason: 'Chat was closed.' },
        input: TOOL_INPUT,
        state: 'output-denied',
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_NAME,
        type: 'dynamic-tool',
      }),
    ]);

    expect(toolResultsFor(modelMessages, TOOL_CALL_ID)).toEqual([
      expect.objectContaining({
        output: { type: 'error-text', value: 'Chat was closed.' },
        toolName: TOOL_NAME,
      }),
    ]);
  });

  test('an output-error part yields a tool result carrying the error text', async () => {
    const modelMessages = await convertToModelMessages([
      userMessage(),
      assistantMessage({
        approval: { approved: true, id: APPROVAL_ID },
        errorText: 'Result was lost.',
        input: TOOL_INPUT,
        state: 'output-error',
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_NAME,
        type: 'dynamic-tool',
      }),
    ]);

    expect(toolResultsFor(modelMessages, TOOL_CALL_ID)).toEqual([
      expect.objectContaining({
        output: { type: 'error-text', value: 'Result was lost.' },
        toolName: TOOL_NAME,
      }),
    ]);
  });
});

describe('streamText tool-approval gate', () => {
  test('a tool whose needsApproval resolves true is not executed', async () => {
    // `McpService` puts approval on this native gate rather than intercepting
    // the call itself, so "asked, not run" has to hold inside the SDK.
    const execute = jest.fn(async () => 'file body');
    const result = streamText({
      model: modelCallingTheTool(),
      prompt: 'read the file',
      tools: { [TOOL_NAME]: approvalGatedTool(execute) },
    });

    const streamParts = await collect(result.fullStream);

    expect(execute).not.toHaveBeenCalled();
    expect(streamParts).toContainEqual(
      expect.objectContaining({ approvalId: expect.any(String), type: 'tool-approval-request' }),
    );
    // The step ends cleanly on `tool-calls`, which is what lets ChatRuntime
    // settle the message into `paused` instead of treating it as an abort.
    expect(await result.finishReason).toBe('tool-calls');
  });

  test('the UI message stream exposes the request as approval-requested with an approval id', async () => {
    // `hasPendingToolApproval` keys off exactly this state, and the approval
    // sheet round-trips `approval.id` back as the decision key.
    const result = streamText({
      model: modelCallingTheTool(),
      prompt: 'read the file',
      tools: { [TOOL_NAME]: approvalGatedTool(jest.fn(async () => 'file body')) },
    });

    const message = await readLastUIMessage(result.toUIMessageStream());

    expect(toolPartsOf(message)).toEqual([
      expect.objectContaining({
        approval: expect.objectContaining({ id: expect.any(String) }),
        state: 'approval-requested',
        toolCallId: TOOL_CALL_ID,
      }),
    ]);
  });

  test('the tool definition metadata reaches the part as toolMetadata', async () => {
    // The MCP identity travels from `McpService.wrapTool`'s `metadata` to
    // `readMcpSource`'s `part.toolMetadata` entirely inside the SDK — no code
    // of ours copies it across. If an `ai` upgrade renames or drops the field,
    // `mcpSource` goes undefined, the sheet's "Always allow" quietly stops
    // rendering, and every other test here still passes.
    const result = streamText({
      model: modelCallingTheTool(),
      prompt: 'read the file',
      tools: {
        [TOOL_NAME]: approvalGatedTool(
          jest.fn(async () => 'file body'),
          TOOL_METADATA,
        ),
      },
    });

    const message = await readLastUIMessage(result.toUIMessageStream());

    expect(toolPartsOf(message)).toEqual([
      // It has to survive as far as the state the sheet reads it in.
      expect.objectContaining({ state: 'approval-requested', toolMetadata: TOOL_METADATA }),
    ]);
  });

  test('resuming with a denial produces a denied tool output without running the tool', async () => {
    const execute = jest.fn(async () => 'file body');
    const priorMessage = assistantMessage({
      approval: { approved: false, id: APPROVAL_ID, reason: 'Not that file.' },
      input: TOOL_INPUT,
      state: 'approval-responded',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
      type: 'dynamic-tool',
    });

    const result = streamText({
      messages: await convertToModelMessages([userMessage(), priorMessage]),
      model: modelAnswering('Understood.'),
      tools: { [TOOL_NAME]: approvalGatedTool(execute) },
    });

    // Resume writes into the same assistant message, so the reader is seeded
    // with it — that is also how ChatRuntime continues a paused message.
    const message = await readLastUIMessage(result.toUIMessageStream(), priorMessage);

    expect(execute).not.toHaveBeenCalled();
    expect(toolPartsOf(message)).toEqual([
      expect.objectContaining({ state: 'output-denied', toolCallId: TOOL_CALL_ID }),
    ]);
  });

  test('resuming with an approval executes the tool and settles the part as output-available', async () => {
    const execute = jest.fn(async () => 'file body');
    const priorMessage = assistantMessage({
      approval: { approved: true, id: APPROVAL_ID },
      input: TOOL_INPUT,
      state: 'approval-responded',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
      type: 'dynamic-tool',
    });

    const result = streamText({
      messages: await convertToModelMessages([userMessage(), priorMessage]),
      model: modelAnswering('Here it is.'),
      tools: { [TOOL_NAME]: approvalGatedTool(execute) },
    });

    const message = await readLastUIMessage(result.toUIMessageStream(), priorMessage);

    // The gate is not re-consulted on resume: the recorded approval is what
    // authorises the call, so `needsApproval` staying true must not re-ask.
    expect(execute).toHaveBeenCalledWith(TOOL_INPUT, expect.anything());
    expect(toolPartsOf(message)).toEqual([
      expect.objectContaining({
        output: 'file body',
        state: 'output-available',
        toolCallId: TOOL_CALL_ID,
      }),
    ]);
  });
});

function userMessage(): UIMessage {
  return { id: 'user-1', parts: [{ text: 'read the file', type: 'text' }], role: 'user' };
}

function assistantMessage(toolPart: DynamicToolUIPart): UIMessage {
  return { id: 'assistant-1', parts: [toolPart], role: 'assistant' };
}

function approvalGatedTool(execute: () => Promise<string>, metadata?: JSONObject) {
  return dynamicTool({
    description: 'Read a file through MCP.',
    execute,
    inputSchema: z.object({ path: z.string() }),
    metadata,
    needsApproval: async () => true,
  });
}

/** Usage is required by the provider spec but irrelevant to every assertion here. */
const NO_USAGE = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: undefined,
    total: undefined,
  },
  outputTokens: { reasoning: undefined, text: undefined, total: undefined },
};

function modelCallingTheTool() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          {
            input: JSON.stringify(TOOL_INPUT),
            toolCallId: TOOL_CALL_ID,
            toolName: TOOL_NAME,
            type: 'tool-call',
          },
          {
            finishReason: { raw: 'tool_calls', unified: 'tool-calls' },
            type: 'finish',
            usage: NO_USAGE,
          },
        ],
      }),
    }),
  });
}

function modelAnswering(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { id: 'text-1', type: 'text-start' },
          { delta: text, id: 'text-1', type: 'text-delta' },
          { id: 'text-1', type: 'text-end' },
          { finishReason: { raw: 'stop', unified: 'stop' }, type: 'finish', usage: NO_USAGE },
        ],
      }),
    }),
  });
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

async function readLastUIMessage(
  stream: Parameters<typeof readUIMessageStream>[0]['stream'],
  message?: UIMessage,
): Promise<UIMessage> {
  let last: UIMessage | undefined;
  for await (const next of readUIMessageStream({ message, stream })) {
    last = next;
  }
  if (last === undefined) {
    throw new Error('the UI message stream produced no message');
  }
  return last;
}

function toolPartsOf(message: UIMessage) {
  return message.parts.filter((part) => part.type === 'dynamic-tool');
}

function toolMessages(messages: ModelMessage[]): ToolModelMessage[] {
  return messages.filter((message): message is ToolModelMessage => message.role === 'tool');
}

function toolMessageParts(messages: ModelMessage[]) {
  return toolMessages(messages).flatMap((message) => message.content);
}

function toolResultsFor(messages: ModelMessage[], toolCallId: string) {
  return toolMessageParts(messages).filter(
    (part) => part.type === 'tool-result' && part.toolCallId === toolCallId,
  );
}

function assistantToolCalls(messages: ModelMessage[]) {
  return messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((part) => typeof part === 'object' && part.type === 'tool-call');
}
