import { describe, expect, it } from 'vitest';

import providersRegistry from '../../data/providers.json';
import { ApiFeaturesSchema, ProviderListSchema } from '../schemas/provider';

describe('provider billing features', () => {
  it('does not trust provider-reported cost by default', () => {
    expect(ApiFeaturesSchema.parse({}).reportsActualCost).toBe(false);
  });

  it('declares OpenRouter actual cost and fallback currency', () => {
    const providers = ProviderListSchema.parse(providersRegistry).providers;
    const openrouter = providers.find(({ id }) => id === 'openrouter');

    expect(openrouter?.apiFeatures?.reportsActualCost).toBe(true);
    expect(openrouter?.reportedCostCurrency).toBe('USD');
  });
});
