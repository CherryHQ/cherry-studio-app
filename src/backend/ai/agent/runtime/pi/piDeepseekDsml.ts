import {
  createDeepseekDsmlParser,
  DeepseekDsmlError,
  type DeepseekDsmlCall,
  type DeepseekDsmlPart,
} from '@cherrystudio/ai-runtime/provider';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type {
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

type ContentState = {
  index: number;
  block: TextContent | ThinkingContent;
  parser?: ReturnType<typeof createDeepseekDsmlParser>;
  receivedLength: number;
  ended: boolean;
  calls: DeepseekDsmlCall[];
};

/** Normalize before Pi commits the assistant message and decides which tools to execute. */
export function withPiDeepseekDsml(streamFn: StreamFn): StreamFn {
  return (model, context, options) => {
    const stream = new AssistantMessageEventStream();
    const content: AssistantMessage['content'] = [];
    const states = new Map<number, ContentState>();
    const nativeToolIndices = new Map<number, number>();
    let parseError: DeepseekDsmlError | undefined;
    let extracted = false;
    let started = false;
    let partial: AssistantMessage = {
      role: 'assistant',
      api: model.api,
      provider: model.provider,
      model: model.id,
      content,
      stopReason: 'stop',
      timestamp: Date.now(),
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };

    const updateMessage = (source: AssistantMessage) => {
      partial = { ...source, content };
      if (!started) {
        stream.push({ type: 'start', partial });
        started = true;
      }
    };
    const getState = (sourceIndex: number, block: TextContent | ThinkingContent): ContentState => {
      let state = states.get(sourceIndex);
      if (!state) {
        state = {
          index: content.length,
          block: block.type === 'text' ? { ...block, text: '' } : { ...block, thinking: '' },
          parser: createDeepseekDsmlParser(context.tools),
          receivedLength: 0,
          ended: false,
          calls: [],
        };
        states.set(sourceIndex, state);
        content.push(state.block);
        stream.push({
          type: block.type === 'text' ? 'text_start' : 'thinking_start',
          contentIndex: state.index,
          partial,
        });
      }
      return state;
    };
    const emitParts = (state: ContentState, parts: DeepseekDsmlPart[]) => {
      for (const part of parts) {
        if (part.type === 'tool-call') {
          state.calls.push(part);
        } else if (state.block.type === 'text') {
          state.block.text += part.text;
          stream.push({ type: 'text_delta', contentIndex: state.index, delta: part.text, partial });
        } else {
          state.block.thinking += part.text;
          stream.push({
            type: 'thinking_delta',
            contentIndex: state.index,
            delta: part.text,
            partial,
          });
        }
      }
    };
    const parse = (state: ContentState, delta?: string) => {
      if (delta !== undefined) state.receivedLength += delta.length;
      if (!state.parser) return;
      try {
        emitParts(state, delta === undefined ? state.parser.finish() : state.parser.push(delta));
      } catch (error) {
        if (!(error instanceof DeepseekDsmlError)) throw error;
        parseError = error;
        state.parser = undefined;
        state.calls = [];
      }
    };
    const emitToolCall = (toolCall: ToolCall) => {
      const contentIndex = content.length;
      content.push(toolCall);
      stream.push({ type: 'toolcall_start', contentIndex, partial });
      stream.push({
        type: 'toolcall_delta',
        contentIndex,
        delta: JSON.stringify(toolCall.arguments),
        partial,
      });
      stream.push({ type: 'toolcall_end', contentIndex, toolCall, partial });
    };
    const endContent = (state: ContentState, source: TextContent | ThinkingContent) => {
      if (!state.ended) {
        const original = source.type === 'text' ? source.text : source.thinking;
        if (original.length > state.receivedLength)
          parse(state, original.slice(state.receivedLength));
        parse(state);
      }
      const text = state.block.type === 'text' ? state.block.text : state.block.thinking;
      state.block = source.type === 'text' ? { ...source, text } : { ...source, thinking: text };
      content[state.index] = state.block;
      if (state.ended) return;
      stream.push({
        type: source.type === 'text' ? 'text_end' : 'thinking_end',
        contentIndex: state.index,
        content: text,
        partial,
      });
      state.ended = true;
      state.parser = undefined;
      for (const call of state.calls) {
        emitToolCall({
          type: 'toolCall',
          id: call.toolCallId,
          name: call.toolName,
          arguments: call.input,
        });
        extracted = true;
      }
      state.calls = [];
    };
    const fail = (error: Error, aborted = false) => {
      updateMessage(partial);
      partial = {
        ...partial,
        stopReason: aborted ? 'aborted' : 'error',
        errorMessage: error.message,
        diagnostics: [
          ...(partial.diagnostics ?? []),
          {
            type: 'provider_response_failure',
            timestamp: Date.now(),
            error: {
              name: error.name,
              message: error.message,
              ...(error instanceof DeepseekDsmlError ? { code: error.code } : {}),
            },
            ...(error instanceof DeepseekDsmlError
              ? { details: { retryable: error.retryable } }
              : {}),
          },
        ],
      };
      stream.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: partial });
    };

    void (async () => {
      try {
        const source = await streamFn(model, context, options);
        for await (const event of source) {
          updateMessage(
            event.type === 'done'
              ? event.message
              : event.type === 'error'
                ? event.error
                : event.partial,
          );
          if (options?.signal?.aborted && !(event.type === 'error' && event.reason === 'aborted')) {
            fail(new Error('Request aborted.'), true);
            return;
          }
          if (event.type === 'error') {
            stream.push({ ...event, error: partial });
            return;
          }
          if (event.type === 'done') {
            event.message.content.forEach((block, index) => {
              if (block.type === 'toolCall') {
                const mappedIndex = nativeToolIndices.get(index);
                if (mappedIndex !== undefined) content[mappedIndex] = { ...block };
                else emitToolCall({ ...block });
              } else {
                endContent(getState(index, block), block);
              }
            });
            if (parseError) {
              fail(parseError);
            } else {
              const reason = extracted && event.reason === 'stop' ? 'toolUse' : event.reason;
              partial = { ...partial, stopReason: reason };
              stream.push({ type: 'done', reason, message: partial });
            }
            return;
          }
          if (event.type === 'start') continue;
          if (
            event.type === 'toolcall_start' ||
            event.type === 'toolcall_delta' ||
            event.type === 'toolcall_end'
          ) {
            const block =
              event.type === 'toolcall_end'
                ? event.toolCall
                : event.partial.content[event.contentIndex];
            if (block?.type !== 'toolCall') continue;
            let contentIndex = nativeToolIndices.get(event.contentIndex);
            if (contentIndex === undefined) {
              contentIndex = content.length;
              nativeToolIndices.set(event.contentIndex, contentIndex);
            }
            const toolCall = { ...block, arguments: { ...block.arguments } };
            content[contentIndex] = toolCall;
            stream.push(
              event.type === 'toolcall_end'
                ? { ...event, contentIndex, toolCall, partial }
                : { ...event, contentIndex, partial },
            );
            continue;
          }
          const block = event.partial.content[event.contentIndex];
          if (!block || block.type === 'toolCall') continue;
          const state = getState(event.contentIndex, block);
          if (event.type === 'text_delta' || event.type === 'thinking_delta')
            parse(state, event.delta);
          else if (event.type === 'text_end' || event.type === 'thinking_end') {
            endContent(
              state,
              block.type === 'text'
                ? { ...block, text: event.content }
                : { ...block, thinking: event.content },
            );
          }
        }
        fail(
          new Error('The model response ended without a terminal event.'),
          options?.signal?.aborted,
        );
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)), options?.signal?.aborted);
      } finally {
        stream.end();
      }
    })();
    return stream;
  };
}
