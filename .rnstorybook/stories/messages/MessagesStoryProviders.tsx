import { Alert } from '@cherrystudio/ui/components';
import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import {
  getDefaultValue,
  type PreferenceClient,
  type PreferenceSchema,
  type PreferenceKeyType,
  type PreferenceMappedValues,
  type PreferenceMapping,
} from '@cherrystudio/universal/data/preference';
import { FileEntrySchema } from '@cherrystudio/universal/data/types/file';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import type { PropsWithChildren } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { Image } from 'react-native';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { PreferenceProvider } from '@/frontend/data/PreferenceProvider';
import enUS from '@/frontend/i18n/locales/en-us.json';
import type { Backend } from '@/shared/contracts';

import { STORY_FILE_ENTRY_ID } from './messageFixtures';

const storyFileEntry = FileEntrySchema.parse({
  cleanupPolicy: 'manual',
  contentHash: null,
  createdAt: 1,
  ext: 'png',
  id: STORY_FILE_ENTRY_ID,
  name: 'cherry-studio',
  origin: 'internal',
  size: 1,
  updatedAt: 1,
});
const storyFileUri = Image.resolveAssetSource(require('../../../assets/icon.png')).uri;
const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: Infinity } },
});
const storyI18n = createInstance();
void storyI18n.use(initReactI18next).init({
  fallbackLng: 'en-US',
  initAsync: false,
  interpolation: { escapeValue: false },
  keySeparator: false,
  lng: 'en-US',
  resources: { 'en-US': { translation: enUS } },
});

const storyDataApi = {
  get: async (path: string) => {
    if (path === `/files/entries/${STORY_FILE_ENTRY_ID}`) {
      return storyFileEntry;
    }
    throw new Error(`Story Data API received an unsupported GET: ${path}`);
  },
} as ApiClient;

const storyBackend = {
  file: {
    createInternalEntry: async () => {
      throw new Error('Story file creation is not supported');
    },
    deleteIfUnreferenced: async () => false,
    getUri: async (id: string) => (id === STORY_FILE_ENTRY_ID ? storyFileUri : undefined),
  },
} as unknown as Backend;

const storyPreference: PreferenceClient = {
  getCachedValue: <TKey extends PreferenceKeyType>(key: TKey) => getDefaultValue(key),
  getMultipleCached: <TMapping extends PreferenceMapping>(mapping: TMapping) => {
    const values = {} as PreferenceMappedValues<TMapping>;
    for (const name of Object.keys(mapping) as (keyof TMapping)[]) {
      values[name] = getDefaultValue(mapping[name]);
    }
    return values;
  },
  set: async <TKey extends PreferenceKeyType>(_key: TKey, _value: PreferenceSchema[TKey]) =>
    undefined,
  setMultiple: async () => undefined,
  subscribeChange: () => () => () => undefined,
};

export function MessagesStoryProviders({ children }: PropsWithChildren) {
  return (
    <I18nextProvider i18n={storyI18n}>
      <PreferenceProvider preference={storyPreference}>
        <QueryClientProvider client={storyQueryClient}>
          <DataApiProvider dataApi={storyDataApi}>
            <BackendProvider backend={storyBackend}>
              <Alert.Provider labels={{ cancel: 'Cancel', ok: 'OK' }}>{children}</Alert.Provider>
            </BackendProvider>
          </DataApiProvider>
        </QueryClientProvider>
      </PreferenceProvider>
    </I18nextProvider>
  );
}
