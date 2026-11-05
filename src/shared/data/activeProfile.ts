/**
 * The data profile this JavaScript runtime serves. The entry point selects it once before any
 * store opens; switching profiles reloads the runtime instead of replacing it in place.
 */

/** Stable enterprise identity. Tokens, roles and display names are not part of it. */
export type EnterpriseIdentity = Readonly<
  {
    /** Enterprise server id (`serverUniqueId`), not its address. */
    deployment: string;
    subject: string;
  } & ({ issuer: string; productProfileId: string } | { authentication: 'password' })
>;

export type ActiveProfile =
  | Readonly<{ id: 'local'; identity: null; address: null }>
  | Readonly<{
      id: string;
      identity: EnterpriseIdentity;
      /** Enterprise service address, including a private deployment's API path. */
      address: string;
      /** The organization's display name from Accounts Portal; private deployments have none. */
      displayName?: string;
      /** Serialized application choices used only to seed this profile's first database. */
      initialPreferences?: Readonly<Record<string, unknown>>;
    }>;

export const LOCAL_PROFILE: ActiveProfile = Object.freeze({
  id: 'local',
  identity: null,
  address: null,
});

/** Whether two identities name the same person in the same organization on the same server. */
export function isSameEnterpriseIdentity(a: EnterpriseIdentity, b: EnterpriseIdentity): boolean {
  if (a.deployment !== b.deployment || a.subject !== b.subject) return false;
  if ('authentication' in a || 'authentication' in b)
    return 'authentication' in a && 'authentication' in b;
  return a.issuer === b.issuer && a.productProfileId === b.productProfileId;
}

let active: ActiveProfile = LOCAL_PROFILE;

export function setActiveProfile(profile: ActiveProfile): void {
  active = profile;
}

export function getActiveProfile(): ActiveProfile {
  return active;
}

export function isEnterpriseProfile(): boolean {
  return active.identity !== null;
}

/**
 * Names a profile-owned MMKV store or SecureStore key. The local profile keeps the original
 * names so data written before profiles existed stays reachable.
 */
export function profileScopedName(name: string): string {
  return active.id === 'local' ? name : `profile.${active.id}.${name}`;
}
