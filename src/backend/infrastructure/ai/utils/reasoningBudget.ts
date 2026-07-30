import { findTokenLimit } from './model';

export const FALLBACK_TOKEN_LIMIT = { min: 1024, max: 16384 };

export function computeBudgetTokens(
  tokenLimit: { min: number; max: number },
  effortRatio: number,
  maxTokens?: number,
): number {
  const budget = Math.floor((tokenLimit.max - tokenLimit.min) * effortRatio + tokenLimit.min);
  const capped = maxTokens !== undefined ? Math.min(budget, maxTokens) : budget;
  return Math.max(1024, capped);
}

export function getThinkingBudget(
  _maxTokens: number | undefined,
  reasoningEffort: string | undefined,
  modelId: string,
  effortRatioMap: Record<string, number>,
): number | undefined {
  if (reasoningEffort === undefined || reasoningEffort === 'none') {
    return undefined;
  }

  const tokenLimit = findTokenLimit(modelId);
  if (!tokenLimit) {
    return undefined;
  }

  return computeBudgetTokens(tokenLimit, effortRatioMap[reasoningEffort]);
}
