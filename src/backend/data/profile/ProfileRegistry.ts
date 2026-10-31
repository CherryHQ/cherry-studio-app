import * as z from 'zod';

import {
  type ActiveProfile,
  type EnterpriseIdentity,
  isSameEnterpriseIdentity,
  LOCAL_PROFILE,
} from '@/shared/data/activeProfile';
import type { INHERITABLE_PREFERENCE_KEYS, PreferenceSchema } from '@/shared/data/preference';

export const EnterpriseIdentitySchema = z.union([
  z.strictObject({
    deployment: z.string().min(1),
    issuer: z.string().min(1),
    subject: z.string().min(1),
    productProfileId: z.string().min(1),
  }),
  z.strictObject({
    deployment: z.string().min(1),
    subject: z.string().min(1),
    authentication: z.literal('password'),
  }),
]);
const RegistrySchema = z.strictObject({
  version: z.literal(1),
  profiles: z.array(
    z.strictObject({
      id: z.uuid(),
      identity: EnterpriseIdentitySchema,
      address: z.string().min(1),
      displayName: z.string().min(1).optional(),
      initialPreferences: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  active: z.union([z.literal('local'), z.uuid()]),
});
type Registry = z.infer<typeof RegistrySchema>;

const EMPTY: Registry = { version: 1, profiles: [], active: 'local' };

export interface ProfileRegistryStorage {
  read(): string | undefined;
  write(value: string): void;
}

/**
 * Installation directory of data profiles: which enterprise identity owns which profile id, and
 * which profile the next launch opens. It holds no credentials and is not a login authority.
 */
export class ProfileRegistry {
  private data: Registry | undefined;

  constructor(
    private readonly storage: ProfileRegistryStorage,
    private readonly createId: () => string,
    private readonly readInitialPreferences?: () => Pick<
      PreferenceSchema,
      (typeof INHERITABLE_PREFERENCE_KEYS)[number]
    >,
  ) {}

  /** The profile this launch serves. An unreadable selection must stop startup. */
  getActive(): ActiveProfile {
    const { active, profiles } = this.readRegistry();
    if (active === 'local') return LOCAL_PROFILE;
    const profile = profiles.find((candidate) => candidate.id === active);
    if (!profile) throw new Error('The active profile is missing from the profile registry');
    return Object.freeze({ ...profile });
  }

  /**
   * Reuses the profile of a known identity and records the address it was reached at, so a
   * server that moves keeps its data. An unknown display name keeps the recorded one. The local
   * profile is never adopted by a login. Only a new identity captures application preferences.
   */
  resolve(identity: EnterpriseIdentity, address: string, displayName?: string): ActiveProfile {
    const data = this.readRegistry();
    const parsed = EnterpriseIdentitySchema.parse(identity);
    const existing = data.profiles.find((profile) =>
      isSameEnterpriseIdentity(profile.identity, parsed),
    );
    const name = displayName?.trim() || existing?.displayName;
    const profile = {
      id: existing?.id ?? z.uuid().parse(this.createId()),
      identity: parsed,
      address,
      ...(name && { displayName: name }),
      initialPreferences: existing ? existing.initialPreferences : this.readInitialPreferences?.(),
    };
    this.write({
      ...data,
      profiles: [...data.profiles.filter((candidate) => candidate !== existing), profile],
    });
    return Object.freeze(profile);
  }

  /** Selects the profile for the next launch. */
  setActive(profile: ActiveProfile): void {
    this.write({ ...this.readRegistry(), active: profile.id });
  }

  private readRegistry(): Registry {
    if (!this.data) {
      const raw = this.storage.read();
      this.data = raw === undefined ? EMPTY : RegistrySchema.parse(JSON.parse(raw));
    }
    return this.data;
  }

  private write(data: Registry): void {
    this.storage.write(JSON.stringify(RegistrySchema.parse(data)));
    this.data = data;
  }
}
