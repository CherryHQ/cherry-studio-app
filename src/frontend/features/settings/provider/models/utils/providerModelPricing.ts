import {
  CURRENCY,
  type Currency,
  type Model,
  type RuntimeModelPricing,
} from '@/shared/data/types/model';

export const modelPriceFields = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
export type ModelPriceField = (typeof modelPriceFields)[number];
export type ModelPriceTierDraft = Record<ModelPriceField | 'minInputTokens', string> & {
  id: number;
};
export type ModelPricingDraft = { currency: Currency; tiers: ModelPriceTierDraft[] };
export type ModelPricingErrors = Partial<Record<ModelPriceField | 'minInputTokens', string>>[];

export function createModelPricingDraft(pricing?: Model['pricing']): ModelPricingDraft {
  const tiers = [{ ...pricing, minInputTokens: 0 }, ...(pricing?.inputTokenTiers ?? [])];
  return {
    currency: pricing?.input.currency ?? pricing?.output.currency ?? CURRENCY.USD,
    tiers: tiers.map((tier, id) => ({
      id,
      minInputTokens: String(tier.minInputTokens),
      input: tier.input?.perMillionTokens?.toString() ?? '',
      output: tier.output?.perMillionTokens?.toString() ?? '',
      cacheRead: tier.cacheRead?.perMillionTokens?.toString() ?? '',
      cacheWrite: tier.cacheWrite?.perMillionTokens?.toString() ?? '',
    })),
  };
}

export function buildModelPricing(
  draft: ModelPricingDraft,
  original?: Model['pricing'],
): {
  errors: ModelPricingErrors;
  pricing?: RuntimeModelPricing;
} {
  const errors: ModelPricingErrors = draft.tiers.map(() => ({}));
  let previousBoundary = 0;
  const tiers = draft.tiers.map((tier, index) => {
    const rates: RuntimeModelPricing = {
      input: { perMillionTokens: null, currency: draft.currency },
      output: { perMillionTokens: null, currency: draft.currency },
    };
    for (const field of modelPriceFields) {
      const raw = tier[field].trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(value) || value < 0) {
        errors[index][field] = 'settings.provider.models.pricing.invalidPrice';
      } else rates[field] = { perMillionTokens: value, currency: draft.currency };
    }
    const boundary = Number(tier.minInputTokens.trim());
    if (index > 0) {
      if (
        !/^\d+$/.test(tier.minInputTokens.trim()) ||
        !Number.isSafeInteger(boundary) ||
        boundary <= 0
      ) {
        errors[index].minInputTokens = 'settings.provider.models.addPositiveInteger';
      } else if (boundary <= previousBoundary) {
        errors[index].minInputTokens = 'settings.provider.models.pricing.invalidOrder';
      }
      previousBoundary = boundary;
    }
    return { ...rates, minInputTokens: boundary };
  });
  if (tiers.length === 0 || errors.some((tier) => Object.keys(tier).length > 0)) return { errors };
  const [base, ...additional] = tiers;
  return {
    errors,
    pricing: {
      ...original,
      input: base.input,
      output: base.output,
      cacheRead: base.cacheRead,
      cacheWrite: base.cacheWrite,
      inputTokenTiers: additional.length ? additional : undefined,
    },
  };
}
