import type { AccountState } from '@/shared/contracts/account';

/** How the active organization is named: a cloud organization's name or a private host. */
export type OrganizationLabel = Readonly<{ kind: 'organization' | 'server'; label: string }>;

export function organizationLabel(state: AccountState): OrganizationLabel | undefined {
  if (state.privateAddress) return { kind: 'server', label: new URL(state.privateAddress).host };
  if (state.isEnterprise && state.organizationName)
    return { kind: 'organization', label: state.organizationName };
  return undefined;
}
