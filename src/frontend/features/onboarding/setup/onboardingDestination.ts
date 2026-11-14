import type { AccountState } from '@/shared/contracts/account';
import { hasActiveCloudSubscription, type CloudState } from '@/shared/contracts/cloud';

/** An unknown subscription never becomes a model-configuration prompt. */
export function getOnboardingDestination({
  account,
  cloud,
  models,
  organizationManaged,
}: {
  account: Pick<AccountState, 'hasPrompted' | 'isSignedIn'>;
  cloud: CloudState;
  models: { hasModels: boolean; isLoading: boolean; isError: boolean };
  organizationManaged: boolean;
}) {
  if (organizationManaged) return 'completed';
  if (!account.hasPrompted) return 'permissions';
  if (account.isSignedIn) {
    if (cloud.phase === 'loading' || cloud.isRefreshing) return 'loading';
    if (cloud.phase !== 'ready') return 'retry';
    if (hasActiveCloudSubscription(cloud)) return 'subscription';
  }
  if (models.isLoading) return 'loading';
  if (models.isError) return 'retry';
  return models.hasModels ? 'model' : 'source';
}
