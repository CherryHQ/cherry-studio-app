import { extractProviderCostWithCurrency } from '../billingCost';

describe('extractProviderCostWithCurrency', () => {
  it('reads top-level and nested provider cost payloads', () => {
    expect(extractProviderCostWithCurrency({ cost: 1.25, currency: 'USD' })).toEqual({
      amount: 1.25,
      currency: 'USD',
    });
    expect(extractProviderCostWithCurrency({ usage: { cost: 2.5, currency: 'CNY' } })).toEqual({
      amount: 2.5,
      currency: 'CNY',
    });
  });

  it('uses a declared fallback currency only when the payload omits currency', () => {
    expect(extractProviderCostWithCurrency({ cost: 1.25 }, 'USD')).toEqual({
      amount: 1.25,
      currency: 'USD',
    });
    expect(extractProviderCostWithCurrency({ cost: 1.25, currency: 'EUR' }, 'USD')).toBeUndefined();
  });

  it('rejects negative, non-finite, or unpriced cost values', () => {
    expect(extractProviderCostWithCurrency({ cost: -1, currency: 'USD' })).toBeUndefined();
    expect(
      extractProviderCostWithCurrency({ cost: Number.POSITIVE_INFINITY, currency: 'USD' }),
    ).toBeUndefined();
    expect(extractProviderCostWithCurrency({ cost: 1.25 })).toBeUndefined();
  });
});
