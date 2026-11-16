import type { CloudState } from '@/shared/contracts/cloud';

import { getOnboardingDestination } from '../onboardingDestination';

const cloud: CloudState = {
  phase: 'signed_out',
  isRefreshing: false,
  account: null,
  plans: null,
  models: [],
  webUrl: null,
};
const base = {
  account: { hasPrompted: true, isSignedIn: false },
  cloud,
  models: { hasModels: false, isLoading: false, isError: false },
  organizationManaged: false,
};

describe('onboarding account destination', () => {
  it('requires model configuration after skipping sign-in, including when a model was already saved', () => {
    expect(getOnboardingDestination(base)).toBe('source');
    expect(getOnboardingDestination({ ...base, models: { ...base.models, hasModels: true } })).toBe(
      'model',
    );
  });

  it('waits for the subscription result and never treats a failed lookup as no subscription', () => {
    const account = { ...base.account, isSignedIn: true };
    expect(
      getOnboardingDestination({ ...base, account, cloud: { ...cloud, phase: 'loading' } }),
    ).toBe('loading');
    expect(
      getOnboardingDestination({ ...base, account, cloud: { ...cloud, phase: 'error' } }),
    ).toBe('retry');
    expect(
      getOnboardingDestination({ ...base, account, cloud: { ...cloud, phase: 'ready' } }),
    ).toBe('source');
  });

  it('skips provider setup but keeps model selection for a paid entitlement', () => {
    const subscribed: CloudState = {
      ...cloud,
      phase: 'ready',
      account: {
        measured_at: '2026-11-12T00:00:00Z',
        account: { id: 'account-1', status: 'active' },
        device: { id: 'device-1' },
        entitlements: [{ plan_id: 'paid', is_free: false, status: 'active', model_ids: ['chat'] }],
        quota_pools: [],
      },
    };
    expect(
      getOnboardingDestination({
        ...base,
        account: { ...base.account, isSignedIn: true },
        cloud: subscribed,
        models: { ...base.models, isLoading: true },
      }),
    ).toBe('subscription');
  });

  it('retains organization-owned configuration and restarts device preparation if sign-in was never presented', () => {
    expect(getOnboardingDestination({ ...base, organizationManaged: true })).toBe('completed');
    expect(
      getOnboardingDestination({ ...base, account: { ...base.account, hasPrompted: false } }),
    ).toBe('permissions');
  });
});
