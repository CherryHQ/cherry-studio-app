import type { Api, FetchFunction } from '@earendil-works/pi-ai';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { raceAbort } from '@/backend/utils/raceAbort';

type FinitePiApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'azure-openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'google-vertex'
  | 'openai-codex-responses';
type JsonRecord = Record<string, unknown>;
type ResponseFailure = 'invalid_json' | 'invalid_response';

/** Protocol/translation failures must not inherit the inner transport's retry classification. */
export class PiNonStreamingResponseError extends Error {
  readonly code = 'non_streaming_response_invalid';
  readonly retryable = false;

  constructor(readonly reason: ResponseFailure) {
    super(`Invalid non-streaming provider response (${reason})`);
    this.name = 'PiNonStreamingResponseError';
  }
}

/** Call before dispatch/key selection when finite mode is requested. */
export function assertPiNonStreamingSupported(api: Api, supportsCustomFetch = true): void {
  if (!supportsCustomFetch || api === 'openai-codex-responses')
    throw new PiNonStreamingUnsupportedError(api);
}

export class PiNonStreamingUnsupportedError extends Error {
  readonly code = 'non_streaming_mode_unsupported';
  readonly retryable = false;

  constructor(readonly api: Api) {
    super('This transport requires streaming. Turn on streaming for this model.');
    this.name = 'PiNonStreamingUnsupportedError';
  }
}

/** Pi serializes error identity into diagnostics before the terminal message reaches callers. */
export function isPiNonStreamingError(
  error: { name?: unknown; code?: unknown } | undefined,
): boolean {
  return (
    (error?.name === 'PiNonStreamingResponseError' &&
      error.code === 'non_streaming_response_invalid') ||
    (error?.name === 'PiNonStreamingUnsupportedError' &&
      error.code === 'non_streaming_mode_unsupported')
  );
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PiNonStreamingResponseError('invalid_response');
  }
  return value as JsonRecord;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new PiNonStreamingResponseError('invalid_response');
  return value;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new PiNonStreamingResponseError('invalid_response');
  return value;
}

function sse(data: JsonRecord, event?: string): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

function completionEvents(response: JsonRecord): string[] {
  const choices = array(response.choices);
  if (!choices.length) throw new PiNonStreamingResponseError('invalid_response');
  const chunks = choices.map((value) => {
    const choice = record(value);
    const message = record(choice.message);
    if (
      message.content != null &&
      typeof message.content !== 'string' &&
      !Array.isArray(message.content)
    ) {
      throw new PiNonStreamingResponseError('invalid_response');
    }
    const delta = { ...message };
    if (
      (message.content == null ||
        message.content === '' ||
        (Array.isArray(message.content) && !message.content.length)) &&
      typeof message.refusal === 'string' &&
      message.refusal.length > 0
    ) {
      delta.content = message.refusal;
    }
    for (const field of ['reasoning_content', 'reasoning', 'reasoning_text']) {
      if (message[field] != null) string(message[field]);
    }
    if (message.reasoning_details != null) array(message.reasoning_details);
    if (message.tool_calls != null) {
      delta.tool_calls = array(message.tool_calls).map((value, index) => {
        const tool = record(value);
        string(tool.id);
        if (tool.function != null) {
          const fn = record(tool.function);
          string(fn.name);
          string(fn.arguments);
        } else {
          const custom = record(tool.custom);
          string(custom.name);
          string(custom.input);
        }
        return { ...tool, index: typeof tool.index === 'number' ? tool.index : index };
      });
    }
    const hasPayload = [
      delta.content,
      message.reasoning_content,
      message.reasoning,
      message.reasoning_text,
      message.reasoning_details,
      message.refusal,
      message.tool_calls,
    ].some((value) => (typeof value === 'string' || Array.isArray(value)) && value.length > 0);
    if (!(typeof choice.finish_reason === 'string' && choice.finish_reason.trim()) && !hasPayload) {
      throw new PiNonStreamingResponseError('invalid_response');
    }
    const { message: _message, ...extras } = choice;
    return { ...extras, delta };
  });
  // Keep provider-native metadata on both chunks for observers as well as Pi's parser.
  const events = [sse({ ...response, choices: chunks })];
  if (response.usage != null) events.push(sse({ ...response, choices: [] }));
  events.push('data: [DONE]\n\n');
  return events;
}

function responseEvents(response: JsonRecord): string[] {
  const status = response.status;
  if (status !== 'completed' && status !== 'incomplete' && status !== 'failed') {
    throw new PiNonStreamingResponseError('invalid_response');
  }
  const events: string[] = [];
  const emit = (type: string, data: JsonRecord) => events.push(sse({ ...data, type }, type));
  if (response.id != null) emit('response.created', { response });
  for (const [outputIndex, value] of array(response.output).entries()) {
    const item = record(value);
    string(item.type);
    const identity = { output_index: outputIndex, item_id: item.id };
    let initialItem = item;
    if (item.type === 'function_call' || item.type === 'custom_tool_call') {
      const inputField = item.type === 'function_call' ? 'arguments' : 'input';
      string(item[inputField]);
      string(item.name);
      string(item.call_id);
      // Pi uses call_id|id. An empty suffix keeps a missing item ID absent on replay.
      // Start with empty input because Pi appends the delta.
      initialItem = {
        ...item,
        id: item.id === undefined ? '' : string(item.id),
        [inputField]: '',
      };
    } else if (item.type === 'message') {
      array(item.content);
      initialItem = { ...item, content: [] };
    } else if (item.type === 'reasoning') {
      if (item.summary != null) array(item.summary);
      if (item.content != null) array(item.content);
      initialItem = { ...item, summary: [], ...(item.content != null ? { content: [] } : {}) };
    }
    emit('response.output_item.added', { ...identity, item: initialItem });
    if (item.type === 'message') {
      for (const [contentIndex, value] of array(item.content).entries()) {
        const part = record(value);
        const fields = { ...identity, content_index: contentIndex };
        emit('response.content_part.added', { ...fields, part });
        if (part.type === 'output_text') {
          emit('response.output_text.delta', { ...fields, delta: string(part.text) });
        } else if (part.type === 'refusal') {
          emit('response.refusal.delta', { ...fields, delta: string(part.refusal) });
        }
        emit('response.content_part.done', { ...fields, part });
      }
    } else if (item.type === 'reasoning') {
      for (const [summaryIndex, value] of (item.summary == null
        ? []
        : array(item.summary)
      ).entries()) {
        const part = record(value);
        const fields = { ...identity, summary_index: summaryIndex };
        emit('response.reasoning_summary_part.added', { ...fields, part });
        emit('response.reasoning_summary_text.delta', { ...fields, delta: string(part.text) });
        emit('response.reasoning_summary_part.done', { ...fields, part });
      }
      for (const [contentIndex, value] of (item.content == null
        ? []
        : array(item.content)
      ).entries()) {
        const part = record(value);
        emit('response.reasoning_text.delta', {
          ...identity,
          content_index: contentIndex,
          delta: string(part.text),
        });
      }
    } else if (item.type === 'function_call') {
      emit('response.function_call_arguments.delta', { ...identity, delta: item.arguments });
    } else if (item.type === 'custom_tool_call') {
      emit('response.custom_tool_call_input.delta', { ...identity, delta: item.input });
    }
    emit('response.output_item.done', { ...identity, item });
  }
  emit(`response.${status}`, { response });
  return events;
}

function anthropicEvents(response: JsonRecord): string[] {
  string(response.id);
  string(response.model);
  string(response.stop_reason);
  const usage = record(response.usage);
  const events: string[] = [];
  const emit = (type: string, data: JsonRecord = {}) => events.push(sse({ ...data, type }, type));
  emit('message_start', {
    message: { ...response, content: [], stop_reason: null, stop_sequence: null, usage },
  });
  for (const [index, value] of array(response.content).entries()) {
    const block = record(value);
    string(block.type);
    let start = block;
    const deltas: JsonRecord[] = [];
    if (block.type === 'text') {
      start = { ...block, text: '' };
      delete start.citations;
      deltas.push({ type: 'text_delta', text: string(block.text) });
      if (block.citations != null)
        for (const citation of array(block.citations))
          deltas.push({ type: 'citations_delta', citation: record(citation) });
    } else if (block.type === 'thinking') {
      start = { ...block, thinking: '', signature: '' };
      deltas.push({ type: 'thinking_delta', thinking: string(block.thinking) });
      if (block.signature != null)
        deltas.push({ type: 'signature_delta', signature: string(block.signature) });
    } else if (block.type === 'redacted_thinking') {
      string(block.data);
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      string(block.id);
      string(block.name);
      start = { ...block, input: {} };
      deltas.push({ type: 'input_json_delta', partial_json: JSON.stringify(record(block.input)) });
    }
    emit('content_block_start', { index, content_block: start });
    for (const delta of deltas) emit('content_block_delta', { index, delta });
    emit('content_block_stop', { index });
  }
  emit('message_delta', {
    delta: {
      stop_reason: response.stop_reason,
      stop_sequence: response.stop_sequence,
      ...(response.stop_details != null ? { stop_details: response.stop_details } : {}),
    },
    usage,
    ...(response.input_transformations != null
      ? { input_transformations: response.input_transformations }
      : {}),
  });
  emit('message_stop');
  return events;
}

function googleEvents(response: JsonRecord): string[] {
  const blockReason =
    response.promptFeedback == null ? undefined : record(response.promptFeedback).blockReason;
  if (
    (response.candidates == null ||
      (Array.isArray(response.candidates) && !response.candidates.length)) &&
    typeof blockReason === 'string' &&
    blockReason.length > 0
  ) {
    response = {
      ...response,
      candidates: [{ finishReason: blockReason, content: { role: 'model', parts: [] } }],
    };
  }
  const candidates = array(response.candidates);
  if (!candidates.length) throw new PiNonStreamingResponseError('invalid_response');
  for (const value of candidates) {
    const candidate = record(value);
    // Terminal rejection candidates may omit content or its parts.
    const parts = candidate.content == null ? undefined : record(candidate.content).parts;
    if (parts != null) {
      for (const part of array(parts)) {
        const item = record(part);
        if (item.text != null) string(item.text);
        if (item.functionCall != null) {
          const call = record(item.functionCall);
          string(call.name);
          if (call.args != null) record(call.args);
        }
      }
    }
    string(candidate.finishReason);
  }
  if (response.usageMetadata != null) record(response.usageMetadata);
  return [sse(response)];
}

/** Compose outside withRetryableBodyFailure when finite mode is selected. */
export function createPiNonStreamingFetch(api: FinitePiApi, fetch: FetchFunction): FetchFunction {
  assertPiNonStreamingSupported(api);
  return async (input, init) => {
    const cancellation = new AbortController();
    const callerSignal =
      init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
    const linked = linkAbortSignals(
      callerSignal ? [callerSignal, cancellation.signal] : [cancellation.signal],
    );
    const signal = linked.signal;
    let response: Response;
    try {
      const requestBody =
        init?.body ??
        (typeof input === 'object' && 'clone' in input ? await input.clone().text() : undefined);
      let body = requestBody;
      let target = input;
      if (
        api === 'google-generative-ai' ||
        api === 'google-vertex' ||
        api === 'anthropic-messages'
      ) {
        const url = new URL(
          typeof input === 'object' && 'url' in input ? input.url : String(input),
        );
        if (api === 'anthropic-messages') {
          url.pathname = url.pathname.replace(/:streamRawPredict$/, ':rawPredict');
        } else {
          url.pathname = url.pathname.replace(/:streamGenerateContent$/, ':generateContent');
          if (url.searchParams.get('alt') === 'sse') url.searchParams.delete('alt');
        }
        target =
          typeof input === 'object' && 'url' in input ? new Request(url, input) : url.toString();
      }
      if (api !== 'google-generative-ai' && api !== 'google-vertex') {
        const json = record(JSON.parse(String(requestBody)));
        json.stream = false;
        if (api !== 'anthropic-messages') delete json.stream_options;
        body = JSON.stringify(json);
      }
      const pending = fetch(target, { ...init, signal, body });
      // A transport that resolves after cancellation still has to release its native body.
      void pending.then(
        (late) => {
          if (signal.aborted && typeof late.body?.cancel === 'function')
            void late.body.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      response = await raceAbort(pending, signal);
    } catch (error) {
      linked.dispose();
      throw error;
    }
    const source = response.body;
    if (!response.ok && !source) {
      linked.dispose();
      return response;
    }

    const headers = new Headers(response.headers);
    if (response.ok) {
      headers.set('content-type', 'text/event-stream');
      for (const header of ['content-length', 'content-encoding', 'transfer-encoding'])
        headers.delete(header);
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let events: string[] | undefined;
    let eventIndex = 0;
    let isStopped = false;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      linked.dispose();
    };
    const cancelSource = (reason?: unknown) =>
      (reader ? reader.cancel(reason) : (source?.cancel?.(reason) ?? Promise.resolve())).catch(
        () => undefined,
      );
    const onAbort = () => {
      if (isStopped) return;
      isStopped = true;
      controller.error(
        signal.reason instanceof Error ? signal.reason : new Error('The operation was aborted.'),
      );
      void cancelSource(signal.reason);
      cleanup();
    };
    const body = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value;
          signal.addEventListener('abort', onAbort, { once: true });
          if (signal.aborted) onAbort();
        },
        async pull(controller) {
          try {
            if (!response.ok) {
              reader ??= source!.getReader();
              const { done, value } = await reader.read();
              if (isStopped) return;
              if (done) {
                isStopped = true;
                controller.close();
                cleanup();
              } else controller.enqueue(value);
              return;
            }
            if (!events) {
              if (
                response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')
              ) {
                throw new PiNonStreamingUnsupportedError(api);
              }
              if (typeof source?.getReader !== 'function')
                throw new PiNonStreamingResponseError('invalid_response');
              reader = source.getReader();
              const decoder = new TextDecoder();
              let text = '';
              while (true) {
                const chunk = await reader.read();
                if (isStopped) return;
                if (chunk.done) break;
                text += decoder.decode(chunk.value, { stream: true });
                if (/^\s*(?:data:|event:|:)/.test(text)) {
                  throw new PiNonStreamingUnsupportedError(api);
                }
              }
              text += decoder.decode();
              let json: unknown;
              try {
                json = JSON.parse(text);
              } catch {
                throw new PiNonStreamingResponseError('invalid_json');
              }
              const finiteResponse = record(json);
              if (finiteResponse.usage != null) record(finiteResponse.usage);
              events =
                api === 'openai-completions'
                  ? completionEvents(finiteResponse)
                  : api === 'anthropic-messages'
                    ? anthropicEvents(finiteResponse)
                    : api === 'google-generative-ai' || api === 'google-vertex'
                      ? googleEvents(finiteResponse)
                      : responseEvents(finiteResponse);
            }
            if (isStopped) return;
            if (eventIndex < events.length)
              controller.enqueue(new TextEncoder().encode(events[eventIndex++]));
            else {
              isStopped = true;
              controller.close();
              cleanup();
            }
          } catch (error) {
            if (isStopped) return;
            isStopped = true;
            controller.error(error);
            void cancelSource();
            cancellation.abort();
            cleanup();
          }
        },
        async cancel(reason) {
          isStopped = true;
          cancellation.abort(reason);
          cleanup();
          await cancelSource(reason);
        },
      },
      { highWaterMark: 0 },
    );
    if (!response.ok) {
      Object.defineProperty(response, 'body', { value: body });
      // Expo's native consumers bypass .body. Keep them intact and release their abort link
      // after consumption; RN's global Response cannot construct a replacement from a stream.
      for (const method of ['text', 'json', 'arrayBuffer', 'blob', 'formData'] as const) {
        const consume = response[method].bind(response);
        Object.defineProperty(response, method, {
          value: async () => {
            try {
              return await raceAbort(consume(), signal);
            } finally {
              cleanup();
            }
          },
        });
      }
      return response;
    }
    const synthetic = new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    Object.defineProperty(synthetic, 'body', { value: body });
    return synthetic;
  };
}
