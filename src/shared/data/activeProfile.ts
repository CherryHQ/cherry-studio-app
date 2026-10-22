/**
 * The data profile this JavaScript runtime serves. The entry point selects it once before any
 * store opens; switching profiles reloads the runtime instead of replacing it in place.
 */

/** Stable enterprise identity. Tokens, roles and display names are not part of it. */
export type EnterpriseIdentity = Readonly<{
  /** Enterprise server id (`serverUniqueId`), not its address. */
  deployment: string;
  issuer: string;
  subject: string;
  /** Accounts Portal enterprise profile id. */
  productProfileId: string;
}>;

export type ActiveProfile =
  | Readonly<{ id: 'local'; identity: null; address: null }>
  | Readonly<{
      id: string;
      identity: EnterpriseIdentity;
      /** Enterprise service address, including a private deployment's API path. */
      address: string;
    }>;

export const LOCAL_PROFILE: ActiveProfile = Object.freeze({
  id: 'local',
  identity: null,
  address: null,
});

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
