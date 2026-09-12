import { CURRENCY, type Model } from '@/shared/data/types/model';

import { buildModelPricing, createModelPricingDraft } from '../providerModelPricing';

describe('model pricing edits', () => {
  it('keeps unknown rates unpriced and preserves non-token pricing when another rate changes', () => {
    const original: Model['pricing'] = {
      input: { perMillionTokens: null, currency: CURRENCY.USD },
      output: { perMillionTokens: 12, currency: CURRENCY.USD },
      perImage: { price: 0.04, unit: 'image' },
      perMinute: { price: 0.1 },
    };
    const draft = createModelPricingDraft(original);
    draft.tiers[0].output = '15';
    expect(buildModelPricing(draft, original).pricing).toMatchObject({
      input: { perMillionTokens: null, currency: CURRENCY.USD },
      output: { perMillionTokens: 15, currency: CURRENCY.USD },
      perImage: { price: 0.04, unit: 'image' },
      perMinute: { price: 0.1 },
    });
  });

  it('updates the currency across all tiers and distinguishes free cache rates from fallback', () => {
    const draft = createModelPricingDraft();
    draft.currency = CURRENCY.CNY;
    draft.tiers[0].input = '2.5';
    draft.tiers[0].output = '8';
    draft.tiers[0].cacheRead = '0';
    draft.tiers.push({ ...draft.tiers[0], id: 1, minInputTokens: '200000', input: '5' });
    const pricing = buildModelPricing(draft).pricing;
    expect(pricing?.cacheRead).toEqual({ perMillionTokens: 0, currency: CURRENCY.CNY });
    expect(pricing?.cacheWrite).toBeUndefined();
    expect(pricing?.inputTokenTiers).toEqual([
      {
        minInputTokens: 200000,
        input: { perMillionTokens: 5, currency: CURRENCY.CNY },
        output: { perMillionTokens: 8, currency: CURRENCY.CNY },
        cacheRead: { perMillionTokens: 0, currency: CURRENCY.CNY },
      },
    ]);
  });

  it.each(['', '0', '-1', '1.5', '9007199254740992'])(
    'blocks incomplete or invalid tier thresholds: %s',
    (minInputTokens) => {
      const draft = createModelPricingDraft();
      draft.tiers.push({ ...draft.tiers[0], id: 1, minInputTokens });
      const result = buildModelPricing(draft);
      expect(result.pricing).toBeUndefined();
      expect(result.errors[1].minInputTokens).toBeDefined();
    },
  );

  it('rejects duplicate and descending thresholds without dropping the unfinished tier', () => {
    const draft = createModelPricingDraft();
    draft.tiers.push({ ...draft.tiers[0], id: 1, minInputTokens: '200000' });
    for (const minInputTokens of ['100000', '200000']) {
      const result = buildModelPricing({
        ...draft,
        tiers: [...draft.tiers, { ...draft.tiers[0], id: 2, minInputTokens }],
      });
      expect(result.pricing).toBeUndefined();
      expect(result.errors[2].minInputTokens).toBe('settings.provider.models.pricing.invalidOrder');
    }
  });

  it.each(['-1', 'Infinity', 'NaN', '0x10', 'abc'])(
    'does not turn an invalid price into a free rate: %s',
    (value) => {
      const draft = createModelPricingDraft();
      draft.tiers[0].input = value;
      expect(buildModelPricing(draft).pricing).toBeUndefined();
    },
  );
});
