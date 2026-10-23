import { loggerService } from '@logger';
import * as z from 'zod';

import {
  type ActiveProfile,
  type EnterpriseIdentity,
  isSameEnterpriseIdentity,
  LOCAL_PROFILE,
} from '@/shared/data/activeProfile';

const logger = loggerService.withContext('ProfileRegistry');

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
  private data: Registry;

  constructor(
    private readonly storage: ProfileRegistryStorage,
    private readonly createId: () => string,
  ) {
    this.data = this.load();
  }

  /** The profile this launch serves. An unknown active id falls back to local data. */
  getActive(): ActiveProfile {
    const { active, profiles } = this.data;
    if (active === 'local') return LOCAL_PROFILE;
    const profile = profiles.find((candidate) => candidate.id === active);
    return profile ? Object.freeze({ ...profile }) : LOCAL_PROFILE;
  }

  /**
   * Reuses the profile of a known identity and records the address it was reached at, so a
   * server that moves keeps its data. An unknown display name keeps the recorded one. The local
   * profile is never adopted by a login.
   */
  resolve(identity: EnterpriseIdentity, address: string, displayName?: string): ActiveProfile {
    const parsed = EnterpriseIdentitySchema.parse(identity);
    const existing = this.data.profiles.find((profile) =>
      isSameEnterpriseIdentity(profile.identity, parsed),
    );
    const name = displayName?.trim() || existing?.displayName;
    const profile = {
      id: existing?.id ?? z.uuid().parse(this.createId()),
      identity: parsed,
      address,
      ...(name && { displayName: name }),
    };
    this.write({
      ...this.data,
      profiles: [...this.data.profiles.filter((candidate) => candidate !== existing), profile],
    });
    return Object.freeze(profile);
  }

  /** Selects the profile for the next launch. */
  setActive(profile: ActiveProfile): void {
    this.write({ ...this.data, active: profile.id });
  }

  private load(): Registry {
    try {
      const raw = this.storage.read();
      return raw ? RegistrySchema.parse(JSON.parse(raw)) : EMPTY;
    } catch (error) {
      // Profile data stays on disk under its id; only the directory is lost.
      logger.error('Discarding an unreadable profile registry', error as Error);
      this.write(EMPTY);
      return EMPTY;
    }
  }

  private write(data: Registry): void {
    this.storage.write(JSON.stringify(RegistrySchema.parse(data)));
    this.data = data;
  }
}
