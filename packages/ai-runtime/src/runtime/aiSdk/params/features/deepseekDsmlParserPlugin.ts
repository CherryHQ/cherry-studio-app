import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { definePlugin } from '@cherrystudio/ai-core';
import type { LanguageModelMiddleware } from 'ai';

import {
  createDeepseekDsmlParser,
  type DeepseekDsmlCall,
  type DeepseekDsmlPart,
} from '../../../../provider/deepseek-dsml';

function createDeepseekDsmlParserMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ doStream, params }) => {
      const { stream, ...rest } = await doStream();
      type ContentState = {
        id: string;
        type: 'text' | 'reasoning';
        parser: ReturnType<typeof createDeepseekDsmlParser>;
        pendingCalls: DeepseekDsmlCall[];
      };
      type Controller = TransformStreamDefaultController<LanguageModelV3StreamPart>;
      const states = new Map<string, ContentState>();
      let extracted = false;

      const getState = (type: ContentState['type'], id: string): ContentState => {
        const key = `${type}:${id}`;
        let state = states.get(key);
        if (!state) {
          state = { type, id, parser: createDeepseekDsmlParser(params.tools), pendingCalls: [] };
          states.set(key, state);
        }
        return state;
      };
      const emitCalls = (calls: DeepseekDsmlCall[], controller: Controller) => {
        for (const call of calls) {
          const { toolCallId: id, toolName } = call;
          const input = JSON.stringify(call.input);
          controller.enqueue({ type: 'tool-input-start', id, toolName });
          controller.enqueue({ type: 'tool-input-delta', id, delta: input });
          controller.enqueue({ type: 'tool-input-end', id });
          controller.enqueue({ type: 'tool-call', toolCallId: id, toolName, input });
          extracted = true;
        }
      };
      const emitParts = (
        parts: DeepseekDsmlPart[],
        state: ContentState,
        controller: Controller,
      ) => {
        for (const part of parts) {
          if (part.type === 'text') {
            controller.enqueue({ type: `${state.type}-delta`, id: state.id, delta: part.text });
          } else if (state.type === 'reasoning') {
            state.pendingCalls.push(part);
          } else {
            emitCalls([part], controller);
          }
        }
      };
      const endContent = (
        state: ContentState,
        controller: Controller,
        end?: LanguageModelV3StreamPart,
      ) => {
        emitParts(state.parser.finish(), state, controller);
        controller.enqueue(end ?? { type: `${state.type}-end`, id: state.id });
        // Reasoning must close before the recovered call reaches the tool loop.
        emitCalls(state.pendingCalls, controller);
        states.delete(`${state.type}:${state.id}`);
      };

      return {
        ...rest,
        stream: stream.pipeThrough(
          new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
            transform(chunk, controller) {
              switch (chunk.type) {
                case 'text-start':
                case 'reasoning-start':
                  getState(chunk.type === 'text-start' ? 'text' : 'reasoning', chunk.id);
                  controller.enqueue(chunk);
                  return;
                case 'text-delta':
                case 'reasoning-delta': {
                  const state = getState(
                    chunk.type === 'text-delta' ? 'text' : 'reasoning',
                    chunk.id,
                  );
                  emitParts(state.parser.push(chunk.delta), state, controller);
                  return;
                }
                case 'text-end':
                case 'reasoning-end':
                  endContent(
                    getState(chunk.type === 'text-end' ? 'text' : 'reasoning', chunk.id),
                    controller,
                    chunk,
                  );
                  return;
                case 'error':
                  states.clear();
                  controller.enqueue(chunk);
                  return;
                case 'finish':
                  if (chunk.finishReason.unified === 'error') {
                    states.clear();
                  } else {
                    for (const state of states.values()) endContent(state, controller);
                  }
                  controller.enqueue(
                    extracted && chunk.finishReason.unified === 'stop'
                      ? { ...chunk, finishReason: { ...chunk.finishReason, unified: 'tool-calls' } }
                      : chunk,
                  );
                  return;
                default:
                  controller.enqueue(chunk);
              }
            },
            flush(controller) {
              for (const state of states.values()) endContent(state, controller);
            },
          }),
        ),
      };
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      const result = await doGenerate();
      const content: typeof result.content = [];
      let extracted = false;
      for (const part of result.content) {
        if (part.type !== 'text' && part.type !== 'reasoning') {
          content.push(part);
          continue;
        }
        const parser = createDeepseekDsmlParser(params.tools);
        const parts = [...parser.push(part.text), ...parser.finish()];
        if (!parts.some((item) => item.type === 'tool-call')) {
          content.push(part);
          continue;
        }
        extracted = true;
        for (const item of parts) {
          content.push(
            item.type === 'text'
              ? { ...part, text: item.text }
              : { ...item, input: JSON.stringify(item.input) },
          );
        }
      }
      return extracted
        ? {
            ...result,
            content,
            finishReason:
              result.finishReason.unified === 'stop'
                ? { ...result.finishReason, unified: 'tool-calls' }
                : result.finishReason,
          }
        : result;
    },
  };
}

export function createDeepseekDsmlParserPlugin() {
  return definePlugin({
    name: 'deepseekDsmlParser',
    enforce: 'pre',
    configureContext: (context) => {
      context.middlewares = context.middlewares || [];
      context.middlewares.push(createDeepseekDsmlParserMiddleware());
    },
  });
}
