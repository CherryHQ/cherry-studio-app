import type { CloudState } from '@/shared/contracts/cloud';

import { getOnboardingDestination } from '../onboardingDestination';

const cloud: CloudState = {
  plans: null,
  phase: 'signed_out',
  isRefreshing: false,
  account: null,
  models: [],
};
const base = {
  account: { hasPrompted: true, isSignedIn: false },
  cloud,
  models: { hasModels: false, isLoading: false, isError: false },
  organizationManaged: false,
  restoringSession: false,
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

  it('restarts device preparation when sign-in was never presented', () => {
    expect(
      getOnboardingDestination({ ...base, account: { ...base.account, hasPrompted: false } }),
    ).toBe('permissions');
  });

  it.each([
    { isSignedIn: false, hasPrompted: false },
    { isSignedIn: true, hasPrompted: false },
    { isSignedIn: false, hasPrompted: true },
    { isSignedIn: true, hasPrompted: true },
  ])(
    'waits for session restoration regardless of account $isSignedIn/$hasPrompted and cloud state',
    (account) => {
      for (const phase of ['signed_out', 'loading', 'error', 'ready'] as const) {
        expect(
          getOnboardingDestination({
            ...base,
            account,
            cloud: { ...cloud, phase },
            restoringSession: true,
          }),
        ).toBe('loading');
      }
    },
  );

  it.each(['loading', 'error', 'ready'] as const)(
    'restored sign-in with hasPrompted=false follows cloud %s without returning to permissions',
    (phase) => {
      expect(
        getOnboardingDestination({
          ...base,
          account: { hasPrompted: false, isSignedIn: true },
          cloud: { ...cloud, phase },
        }),
      ).toBe(phase === 'loading' ? 'loading' : phase === 'error' ? 'retry' : 'source');
    },
  );

  it('restored sign-in keeps a paid subscription and organization-managed completion', () => {
    const restored = { ...base, account: { hasPrompted: false, isSignedIn: true } };
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
    expect(getOnboardingDestination({ ...restored, cloud: subscribed })).toBe('subscription');
    expect(getOnboardingDestination({ ...restored, organizationManaged: true })).toBe('completed');
    expect(getOnboardingDestination({ ...base, organizationManaged: true })).toBe('completed');
    expect(
      getOnboardingDestination({ ...base, organizationManaged: true, restoringSession: true }),
    ).toBe('completed');
  });
});
