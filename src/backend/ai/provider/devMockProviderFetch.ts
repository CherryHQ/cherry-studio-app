import { DEV_MOCK_MODEL_ID } from '@/shared/utils/devMockProvider';

interface OpenAiChatMessage {
  role: string;
  content?: string | { type?: string; text?: string }[] | null;
  tool_call_id?: string;
}

interface OpenAiToolDefinition {
  type?: string;
  function?: {
    name?: string;
  };
}

interface OpenAiChatRequest {
  model?: string;
  stream?: boolean;
  messages?: OpenAiChatMessage[];
  tools?: OpenAiToolDefinition[];
}

function extractText(content: OpenAiChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function parseRequestBody(body: BodyInit | null | undefined): OpenAiChatRequest {
  if (typeof body !== 'string' || !body.trim()) return {};
  try {
    return JSON.parse(body) as OpenAiChatRequest;
  } catch {
    return {};
  }
}

function encodeSseEvents(events: unknown[]): Uint8Array[] {
  const encoder = new TextEncoder();
  return [
    ...events.map((payload) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)),
    encoder.encode('data: [DONE]\n\n'),
  ];
}

function buildStreamingResponse(events: unknown[], signal?: AbortSignal | null): Response {
  const chunks = encodeSseEvents(events);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.error(createAbortError());
        return;
      }
      for (const chunk of chunks) {
        if (signal?.aborted) {
          controller.error(createAbortError());
          return;
        }
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

function splitWordsIntoChunks(text: string, chunkSize = 18): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Deterministic offline OpenAI-compatible fetch adapter for development E2E and Maestro flows.
 *
 * Prompt directives:
 * - `[mock:error]`     -> HTTP 500 JSON error for retry/failure UI verification
 * - `[mock:reasoning]` -> streams `reasoning_content` before the final answer
 * - `[mock:tool]`      -> emits a tool_call for the first declared tool, then summarizes tool output
 * - any other prompt   -> streams `[dev-mock] Echo: <lastUserText>`
 */
export function createDevMockFetch(): (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response> {
  return async (_input, init) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      throw createAbortError();
    }

    const request = parseRequestBody(init?.body);
    const model = request.model ?? DEV_MOCK_MODEL_ID;
    const messages = request.messages ?? [];
    const lastMessage = messages[messages.length - 1];
    let lastUserMessage: OpenAiChatMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }
    const lastUserText = extractText(lastUserMessage?.content).trim();
    const completionId = 'chatcmpl-dev-mock-1';
    const created = 1_760_000_000;

    if (lastUserText.includes('[mock:error]')) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Simulated dev-mock provider failure',
            type: 'server_error',
            code: 'dev_mock_error',
          },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }

    const wantsToolCall =
      lastUserText.includes('[mock:tool]') &&
      lastMessage?.role !== 'tool' &&
      Array.isArray(request.tools) &&
      request.tools.length > 0;

    if (wantsToolCall) {
      const toolName = request.tools?.[0]?.function?.name ?? 'mock_tool';
      const toolArgs = JSON.stringify({
        query: lastUserText.replace('[mock:tool]', '').trim() || 'demo',
      });
      const toolCallId = 'call_dev_mock_1';

      if (request.stream === false) {
        return new Response(
          JSON.stringify({
            id: completionId,
            object: 'chat.completion',
            created,
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: toolCallId,
                      type: 'function',
                      function: { name: toolName, arguments: toolArgs },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return buildStreamingResponse(
        [
          {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: toolCallId,
                      type: 'function',
                      function: { name: toolName, arguments: '' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: toolArgs } }],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
          },
        ],
        signal,
      );
    }

    const toolResultText =
      lastMessage?.role === 'tool' ? extractText(lastMessage.content).trim() : '';
    const replyText = toolResultText
      ? `[dev-mock] Tool result: ${toolResultText}`
      : `[dev-mock] Echo: ${lastUserText || 'ready'}`;
    const reasoningText = lastUserText.includes('[mock:reasoning]')
      ? 'Analyzing request deterministically in dev-mock mode.'
      : '';

    if (request.stream === false) {
      return new Response(
        JSON.stringify({
          id: completionId,
          object: 'chat.completion',
          created,
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: replyText,
                ...(reasoningText ? { reasoning_content: reasoningText } : {}),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 14, total_tokens: 24 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const events: unknown[] = [
      {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      },
    ];

    if (reasoningText) {
      for (const chunk of splitWordsIntoChunks(reasoningText)) {
        events.push({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { reasoning_content: chunk }, finish_reason: null }],
        });
      }
    }

    for (const chunk of splitWordsIntoChunks(replyText)) {
      events.push({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      });
    }

    events.push({
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 14, total_tokens: 24 },
    });

    return buildStreamingResponse(events, signal);
  };
}
