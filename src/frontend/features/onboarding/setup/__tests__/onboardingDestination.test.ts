import { getOnboardingDestination } from '../onboardingDestination';

const base = {
  account: {
    hasPrompted: true,
    isSignedIn: false,
    isRestoringSession: false,
    isRestoringCommunitySession: false,
  },
  models: { hasModels: false, isLoading: false, isError: false },
  organizationManaged: false,
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

  it('resumes pending setup without returning to permissions while the community session restores', () => {
    const account = { ...base.account, hasPrompted: false };
    expect(
      getOnboardingDestination({
        ...base,
        account: { ...account, isRestoringCommunitySession: true },
      }),
    ).toBe('loading');
    expect(getOnboardingDestination({ ...base, account })).toBe('permissions');
    expect(getOnboardingDestination({ ...base, account: { ...account, isSignedIn: true } })).toBe(
      'completed',
    );
  });

  it('retains organization-owned configuration while its session is restoring', () => {
    const account = { ...base.account, isRestoringSession: true };
    expect(getOnboardingDestination({ ...base, account })).toBe('loading');
    expect(getOnboardingDestination({ ...base, account, organizationManaged: true })).toBe(
      'completed',
    );
  });
});
