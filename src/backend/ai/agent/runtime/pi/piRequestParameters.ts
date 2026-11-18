import { resolveReasoningInvocation } from '@cherrystudio/ai-runtime/utils';
import {
  REASONING_FORMAT_PROFILES,
  REASONING_WIRE_TARGETS,
  type ReasoningWireProfile,
} from '@cherrystudio/provider-registry';
import {
  getLowerBaseModelName,
  isClaude47SeriesModel,
  isGemini3Model,
  isMaxTemperatureOneModel,
} from '@cherrystudio/universal/utils/model';

import type { Model } from '@/shared/data/types/model';

import type { RuntimeOptions } from '../types';
import type { SupportedPiApi } from './piApiAdapters';

export type PiRequestParameters = {
  model: Model;
  providerId?: string;
  profile: ReasoningWireProfile;
  selection: RuntimeOptions['reasoningEffort'];
  summary?: string;
};

/** Translate the registry's reasoning vocabulary at Pi's final provider-payload boundary. */
export function applyPiRequestParameters(
  payload: unknown,
  api: SupportedPiApi,
  parameters: PiRequestParameters,
  maxTokens: number,
  temperature: number | undefined,
): Record<string, unknown> {
  if (!isRecord(payload)) throw new Error('Pi produced an invalid provider request.');
  const result = { ...payload };

  // Pi infers these from model names and URLs. The selected registry profile owns them here.
  for (const key of ['reasoning', 'thinking', 'thinking_token_budget']) delete result[key];
  for (const target of REASONING_WIRE_TARGETS) {
    const path = toPiReasoningPath(api, target);
    if (path) removePath(result, path.split('.'));
  }
  removePath(result, ['config', 'thinkingConfig']);

  // Pi may add a thinking budget to Anthropic's output cap; Cherry's cap already includes it.
  if (api === 'anthropic-messages' && typeof result.max_tokens === 'number') {
    maxTokens = Math.min(maxTokens, result.max_tokens);
    result.max_tokens = maxTokens;
  }
  const reasoning = resolveReasoningInvocation({
    selection: parameters.selection === 'off' ? 'none' : parameters.selection,
    model: parameters.model,
    profile: parameters.profile,
    maxTokens,
    assistantSummary: parameters.summary,
  });
  for (const { target, value } of reasoning.emissions) {
    const path = toPiReasoningPath(api, target);
    if (!path) continue;
    setPath(
      result,
      path.split('.'),
      target === 'thinkingConfig.thinkingLevel' && typeof value === 'string'
        ? value.toUpperCase()
        : value,
    );
  }

  const modelId = getLowerBaseModelName(
    parameters.model.apiModelId ??
      parameters.model.modelId ??
      parameters.model.id?.split('::').at(-1) ??
      '',
  );
  const providerId = parameters.providerId ?? parameters.model.providerId;
  if (
    api === 'openai-completions' &&
    ['lmstudio', 'gpustack'].includes(providerId) &&
    /^qwen3(?:-\d|:|$)/.test(modelId) &&
    reasoning.kind !== 'omit' &&
    parameters.profile === REASONING_FORMAT_PROFILES['openai-chat'].wire &&
    Array.isArray(result.messages)
  ) {
    const suffix = reasoning.kind === 'off' ? ' /no_think' : ' /think';
    const append = (text: string) => (/\/(?:no_)?think\s*$/.test(text) ? text : text + suffix);
    result.messages = result.messages.map((message) => {
      if (!isRecord(message) || message.role !== 'user') return message;
      if (typeof message.content === 'string') {
        return { ...message, content: append(message.content) };
      }
      if (!Array.isArray(message.content)) return message;
      const content = [...message.content];
      for (let index = content.length - 1; index >= 0; index--) {
        const part = content[index];
        if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
          content[index] = { ...part, text: append(part.text) };
          break;
        }
      }
      return { ...message, content };
    });
  }

  const resolvedTemperature = resolveTemperature(parameters.model, temperature);
  const temperaturePath =
    api === 'google-generative-ai' || api === 'google-vertex'
      ? ['config', 'temperature']
      : ['temperature'];
  const thinkingType = isRecord(result.thinking) ? result.thinking.type : undefined;
  if (
    resolvedTemperature === undefined ||
    (api === 'anthropic-messages' && (thinkingType === 'enabled' || thinkingType === 'adaptive'))
  ) {
    removePath(result, temperaturePath);
  } else {
    setPath(result, temperaturePath, resolvedTemperature);
  }
  return result;
}

/** Gemini's OpenAI-compatible route validates signatures even for replayed or imported calls. */
export function applyPiRequestCompatibility(
  payload: unknown,
  api: SupportedPiApi,
  modelId: string,
): unknown {
  if (
    api !== 'openai-completions' ||
    !/^gemini-(?:[34](?:[.-]|$)|(?:flash|pro)-latest$)/.test(
      getLowerBaseModelName(modelId ?? ''),
    ) ||
    !isRecord(payload) ||
    !Array.isArray(payload.messages)
  ) {
    return payload;
  }
  return {
    ...payload,
    messages: payload.messages.map((message) => {
      if (
        !isRecord(message) ||
        message.role !== 'assistant' ||
        !Array.isArray(message.tool_calls)
      ) {
        return message;
      }
      return {
        ...message,
        tool_calls: message.tool_calls.map((call) => {
          if (!isRecord(call) || call.type !== 'function') return call;
          const extra = isRecord(call.extra_content) ? call.extra_content : {};
          const google = isRecord(extra.google) ? extra.google : {};
          return {
            ...call,
            extra_content: {
              ...extra,
              google: {
                ...google,
                thought_signature: google.thought_signature ?? 'skip_thought_signature_validator',
              },
            },
          };
        }),
      };
    }),
  };
}

function toPiReasoningPath(api: SupportedPiApi, target: string): string | undefined {
  if (target === 'sendReasoning') return undefined;
  if (target === 'reasoningEffort') {
    return api === 'openai-responses' || api === 'azure-openai-responses'
      ? 'reasoning.effort'
      : 'reasoning_effort';
  }
  if (target === 'reasoningSummary') return 'reasoning.summary';
  if (api === 'anthropic-messages') {
    if (target === 'effort') return 'output_config.effort';
    if (target === 'thinking.budgetTokens') return 'thinking.budget_tokens';
  }
  if (
    (api === 'google-generative-ai' || api === 'google-vertex') &&
    target.startsWith('thinkingConfig.')
  ) {
    return `config.${target}`;
  }
  return target;
}

function resolveTemperature(model: Model, temperature: number | undefined): number | undefined {
  if (temperature === undefined || isGemini3Model(model) || isClaude47SeriesModel(model)) {
    return undefined;
  }
  const support = model.parameters?.temperature ?? model.parameterSupport?.temperature;
  if (support?.supported === false) return undefined;
  const range = model.parameters?.temperature?.range ?? model.parameterSupport?.temperature;
  const minimum = range?.min ?? 0;
  const maximum = range?.max ?? (isMaxTemperatureOneModel(model) ? 1 : 2);
  return Math.max(minimum, Math.min(temperature, maximum));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function setPath(record: Record<string, unknown>, [key, ...rest]: string[], value: unknown): void {
  if (rest.length === 0) {
    record[key] = value;
    return;
  }
  const child = isRecord(record[key]) ? { ...record[key] } : {};
  setPath(child, rest, value);
  record[key] = child;
}

function removePath(record: Record<string, unknown>, [key, ...rest]: string[]): void {
  if (rest.length === 0) {
    delete record[key];
    return;
  }
  if (!isRecord(record[key])) return;
  const child = { ...record[key] };
  removePath(child, rest);
  if (Object.keys(child).length === 0) delete record[key];
  else record[key] = child;
}
