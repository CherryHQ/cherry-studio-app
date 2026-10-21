import { randomUUID } from 'expo-crypto';
import { createMMKV } from 'react-native-mmkv';

import { ProfileRegistry } from '@/backend/data/profile';
import { setActiveProfile } from '@/shared/data/activeProfile';

let registry: ProfileRegistry | undefined;

/** Installation-owned; outlives every profile and runtime reload. */
export function installationProfiles(): ProfileRegistry {
  if (!registry) {
    const store = createMMKV({ id: 'cherry-installation-profiles' });
    registry = new ProfileRegistry(
      { read: () => store.getString('registry'), write: (value) => store.set('registry', value) },
      randomUUID,
    );
  }
  return registry;
}

/** Runs from the entry point before any profile-owned store opens. */
export function selectActiveProfile(): void {
  setActiveProfile(installationProfiles().getActive());
}
