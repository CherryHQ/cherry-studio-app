import type { NetworkRegion } from './configServiceResolve';

export type RepositorySource = 'gitcode' | 'github';

/** Unknown egress retains the existing domestic-first distribution policy. */
export function repositorySourceOrder(region: NetworkRegion | null): readonly RepositorySource[] {
  return region === 'CN' || region === null ? ['gitcode', 'github'] : ['github', 'gitcode'];
}
