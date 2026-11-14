import { useQuery } from '@/frontend/data';
import { useLatestAgentSession } from '@/frontend/hooks/agent';
import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';

/** Shared by entry routing and privacy presentation so a new user never sees a dialog first. */
export function useFirstUseEligibility() {
  const models = useQuery('/models', {
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  const latest = useLatestAgentSession();
  if (models.isPending || latest.isLoading) return 'loading';
  // Failed reads preserve the existing installation's entry and policy-update dialog.
  if (
    models.isError ||
    latest.error ||
    models.data?.some((model) => model.providerId !== CLOUD_PROVIDER_ID) ||
    latest.session
  )
    return 'existing';
  return 'new';
}
