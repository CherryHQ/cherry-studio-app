import { getOnboardingDestination } from '../onboardingDestination';

const base = {
  account: { hasPrompted: true, isSignedIn: false },
  models: { hasModels: false, isLoading: false, isError: false },
  organizationManaged: false,
  restoringSession: false,
};

describe('onboarding account destination', () => {
  it('offers model setup after skipping sign-in and uses saved models when available', () => {
    expect(getOnboardingDestination(base)).toBe('source');
    expect(getOnboardingDestination({ ...base, models: { ...base.models, hasModels: true } })).toBe(
      'model',
    );
  });

  it('waits for local models and keeps a failed lookup retryable after skipping sign-in', () => {
    expect(getOnboardingDestination({ ...base, models: { ...base.models, isLoading: true } })).toBe(
      'loading',
    );
    expect(getOnboardingDestination({ ...base, models: { ...base.models, isError: true } })).toBe(
      'retry',
    );
  });

  it.each([
    base.models,
    { ...base.models, hasModels: true },
    { ...base.models, isLoading: true },
    { ...base.models, isError: true },
  ])('completes after sign-in regardless of local model state (%j)', (models) => {
    expect(
      getOnboardingDestination({ ...base, account: { ...base.account, isSignedIn: true }, models }),
    ).toBe('completed');
  });

  it('restarts device preparation only after deciding the user has not signed in', () => {
    const account = { hasPrompted: false, isSignedIn: false };
    expect(getOnboardingDestination({ ...base, account, restoringSession: true })).toBe('loading');
    expect(getOnboardingDestination({ ...base, account })).toBe('permissions');
    expect(getOnboardingDestination({ ...base, account: { ...account, isSignedIn: true } })).toBe(
      'completed',
    );
  });

  it('retains organization-owned configuration while its session is restoring', () => {
    expect(
      getOnboardingDestination({ ...base, organizationManaged: true, restoringSession: true }),
    ).toBe('completed');
  });
});
