import { resolveReasoningInvocation } from '@cherrystudio/ai-runtime/utils';
import { REASONING_WIRE_TARGETS, type ReasoningWireProfile } from '@cherrystudio/provider-registry';
import {
  isClaude47SeriesModel,
  isGemini3Model,
  isMaxTemperatureOneModel,
} from '@cherrystudio/universal/utils/model';

import type { Model } from '@/shared/data/types/model';

import type { RuntimeOptions } from '../types';
import type { SupportedPiApi } from './piApiAdapters';

export type PiRequestParameters = {
  model: Model;
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

  const resolvedTemperature = resolveTemperature(parameters.model, temperature);
  const temperaturePath =
    api === 'google-generative-ai' ? ['config', 'temperature'] : ['temperature'];
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

function toPiReasoningPath(api: SupportedPiApi, target: string): string | undefined {
  if (target === 'sendReasoning') return undefined;
  if (target === 'reasoningEffort') {
    return api === 'openai-responses' ? 'reasoning.effort' : 'reasoning_effort';
  }
  if (target === 'reasoningSummary') return 'reasoning.summary';
  if (api === 'anthropic-messages') {
    if (target === 'effort') return 'output_config.effort';
    if (target === 'thinking.budgetTokens') return 'thinking.budget_tokens';
  }
  if (api === 'google-generative-ai' && target.startsWith('thinkingConfig.')) {
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
