import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { CherryInOauth } from './CherryInOauth';
import { ProviderOauthSection } from './ProviderOauthSection';

/**
 * Sign-in card for providers that authenticate with OAuth, or nothing at all for
 * the rest. Whether a provider signs in this way is the registry's answer, not a
 * name check here; the CherryIN variant stays CherryIN-specific because the
 * balance it renders is CherryIN's own account surface.
 */
export function ProviderOauthCard({ provider }: { provider?: Provider }) {
  if (!provider?.authMethods?.includes('oauth')) {
    return null;
  }

  return provider.id === 'cherryin' ? (
    <CherryInOauth provider={provider} />
  ) : (
    <ProviderOauthSection provider={provider} />
  );
}
