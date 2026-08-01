/**
 * Guards the `reportsActualCost` provider capability flag: defaults to false,
 * and is set for OpenRouter (whose `usage.cost` is trusted over computed
 * pricing by the per-invocation usage record capture).
 */

import { describe, expect, it } from 'vitest';

import { ApiFeaturesSchema, ProviderListSchema } from '../schemas/provider';
import { readCatalogJson } from '../testing/catalogData';

describe('ApiFeaturesSchema.reportsActualCost', () => {
  it('defaults to false', () => {
    expect(ApiFeaturesSchema.parse({}).reportsActualCost).toBe(false);
  });

  it('declares OpenRouter actual-cost ownership and currency in providers.json', () => {
    const { providers } = ProviderListSchema.parse(readCatalogJson('providers.json'));
    const openrouter = providers.find((p) => p.id === 'openrouter');
    expect(openrouter?.apiFeatures?.reportsActualCost).toBe(true);
    expect(openrouter?.reportedCostCurrency).toBe('USD');
  });
});
