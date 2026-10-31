import { randomUUID } from 'expo-crypto';
import { createMMKV } from 'react-native-mmkv';

import { application } from '@/backend/core/application/Application';
import { ProfileRegistry, resetProfileCaches } from '@/backend/data/profile';
import { setActiveProfile } from '@/shared/data/activeProfile';
import { INHERITABLE_PREFERENCE_KEYS } from '@/shared/data/preference';

import { setDiagnosticProfile } from '../runtime/diagnosticContext';

let registry: ProfileRegistry | undefined;

/** Installation-owned; outlives every profile and runtime reload. */
export function installationProfiles(): ProfileRegistry {
  if (!registry) {
    const store = createMMKV({ id: 'cherry-installation-profiles' });
    registry = new ProfileRegistry(
      { read: () => store.getString('registry'), write: (value) => store.set('registry', value) },
      randomUUID,
      () => application.get('PreferenceService').getMultipleRawCached(INHERITABLE_PREFERENCE_KEYS),
    );
  }
  return registry;
}

/** Runs from the entry point before any profile-owned store opens. */
export function selectActiveProfile(): void {
  const profile = installationProfiles().getActive();
  const store = createMMKV({ id: 'cherry-installation-profiles' });
  if (store.getString('cache-owner') !== profile.id) {
    // An absent owner also clears caches left by an older installation. Publish ownership only
    // after cleanup succeeds; a failure must retry before the next profile can read old content.
    resetProfileCaches();
    store.set('cache-owner', profile.id);
  }
  setActiveProfile(profile);
  setDiagnosticProfile(profile);
}
