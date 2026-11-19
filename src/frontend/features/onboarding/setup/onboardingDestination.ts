import type { AccountState } from '@/shared/contracts/account';

export function getOnboardingDestination({
  account,
  models,
  organizationManaged,
}: {
  account: Pick<AccountState, 'hasPrompted' | 'isSignedIn'>;
  models: { hasModels: boolean; isLoading: boolean; isError: boolean };
  organizationManaged: boolean;
}) {
  if (organizationManaged || account.isSignedIn) return 'completed';
  if (!account.hasPrompted) return 'permissions';
  if (models.isLoading) return 'loading';
  if (models.isError) return 'retry';
  return models.hasModels ? 'model' : 'source';
}
