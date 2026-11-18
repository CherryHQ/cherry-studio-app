import { randomUUID } from 'expo-crypto';
import { createMMKV } from 'react-native-mmkv';

import { application } from '@/backend/core/application/Application';
import { ProfileRegistry, resetProfileCaches } from '@/backend/data/profile';
import { DEFAULT_DOCUMENT_PARSER_MODE } from '@/shared/contracts/fileAttachment';
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
      () => {
        const values = application
          .get('PreferenceService')
          .getMultipleRawCached(INHERITABLE_PREFERENCE_KEYS);
        // A new profile has its own model providers, so a provider-bound parser does not carry over.
        return values['file.document_parser.mode'] === 'deepseek'
          ? { ...values, 'file.document_parser.mode': DEFAULT_DOCUMENT_PARSER_MODE }
          : values;
      },
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
