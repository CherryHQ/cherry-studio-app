export type RepositorySource = 'gitcode' | 'github';

/** Unknown egress retains the existing domestic-first distribution policy. */
export function repositorySourceOrder(country: string | null): readonly RepositorySource[] {
  return country === 'CN' || country === null ? ['gitcode', 'github'] : ['github', 'gitcode'];
}
