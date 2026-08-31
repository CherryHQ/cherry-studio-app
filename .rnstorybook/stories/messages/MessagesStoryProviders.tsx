import { Alert } from '@cherrystudio/ui/components';
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
import type { ApiClient } from '@/shared/data/api/types';
import {
  getDefaultValue,
  type PreferenceClient,
  type PreferenceSchema,
  type PreferenceKeyType,
  type PreferenceMappedValues,
  type PreferenceMapping,
} from '@/shared/data/preference';
import { FileEntrySchema } from '@/shared/data/types/file';

import {
  STORY_EDITED_FILE_ENTRY_ID,
  STORY_FILE_ENTRY_ID,
  STORY_WRITTEN_FILE_ENTRY_ID,
} from './messageFixtures';

const storyFileEntries = new Map(
  [
    {
      createdAt: 1,
      filename: 'cherry-studio.png',
      id: STORY_FILE_ENTRY_ID,
      mediaType: 'image/png',
      provenance: 'imported',
      size: 1,
      updatedAt: 1,
    },
    {
      createdAt: 1,
      filename: 'release-notes.md',
      id: STORY_WRITTEN_FILE_ENTRY_ID,
      mediaType: 'text/markdown',
      provenance: 'generated',
      size: 128,
      updatedAt: 1,
    },
    {
      createdAt: 1,
      filename: 'release-notes.md',
      id: STORY_EDITED_FILE_ENTRY_ID,
      mediaType: 'text/markdown',
      provenance: 'generated',
      size: 126,
      updatedAt: 1,
    },
  ].map((entry) => [entry.id, FileEntrySchema.parse(entry)]),
);
// All entries resolve to the same asset: a card renders from the row, not the bytes.
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
    const entry = storyFileEntries.get(path.replace('/files/entries/', ''));
    if (entry) {
      return entry;
    }
    throw new Error(`Story Data API received an unsupported GET: ${path}`);
  },
} as ApiClient;

const storyBackend = {
  file: {
    createInternalEntry: async () => {
      throw new Error('Story file creation is not supported');
    },
    delete: async () => false,
    getUri: async (id: string) => (storyFileEntries.has(id) ? storyFileUri : undefined),
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
