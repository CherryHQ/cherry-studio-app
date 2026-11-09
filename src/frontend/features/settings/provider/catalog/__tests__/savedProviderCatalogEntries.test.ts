import type { ProviderCatalogEntry } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

import { getSavedProviderCatalogEntries } from '../savedProviderCatalogEntries';

const saved = [
  { id: 'openai', name: 'My OpenAI', presetProviderId: 'openai' },
  { id: 'deepseek', name: 'DeepSeek', presetProviderId: 'deepseek' },
  { id: 'openai-copy', name: 'Work account', presetProviderId: 'openai' },
  { id: 'custom', name: 'My Gateway' },
] as Provider[];
const domesticCatalog = [{ id: 'deepseek' }] as ProviderCatalogEntry[];

test('keeps saved foreign presets and copies accessible without duplicating regional entries', () => {
  expect(getSavedProviderCatalogEntries(saved, domesticCatalog, '').map(({ id }) => id)).toEqual([
    'openai',
    'openai-copy',
    'custom',
  ]);
});

test('searches saved connection names and IDs independently from the discovery catalog', () => {
  expect(getSavedProviderCatalogEntries(saved, domesticCatalog, 'WORK')).toEqual([saved[2]]);
  expect(getSavedProviderCatalogEntries(saved, domesticCatalog, 'openai')).toEqual([
    saved[0],
    saved[2],
  ]);
});
