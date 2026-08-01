import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { WebSearchProviderId } from '@/shared/data/preference';

import { useWebSearchApiKeySettings } from '../useWebSearchApiKeySettings';

type ApiKeySettings = ReturnType<typeof useWebSearchApiKeySettings>;
type ProviderOverrides = Record<string, { apiKeys?: string[] } | undefined>;

const providerId = 'tavily' as WebSearchProviderId;

let mockProviderOverrides: ProviderOverrides;
let mockSetProviderOverrides: jest.Mock;

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockProviderOverrides, mockSetProviderOverrides],
}));

describe('useWebSearchApiKeySettings', () => {
  let renderer: ReactTestRenderer | undefined;
  let settings: ApiKeySettings | undefined;

  function Probe() {
    settings = useWebSearchApiKeySettings(providerId);
    return null;
  }

  function mount() {
    act(() => {
      renderer = create(<Probe />);
    });

    return current();
  }

  // Preferences are pushed through a store subscription, so an unrelated write re-renders
  // this hook with a fresh overrides object.
  function pushPreference(overrides: ProviderOverrides) {
    mockProviderOverrides = overrides;
    act(() => {
      renderer?.update(<Probe />);
    });
  }

  function current() {
    if (!settings) {
      throw new Error('API key settings were not rendered.');
    }

    return settings;
  }

  function keys() {
    return current().entries.map((entry) => entry.key);
  }

  beforeEach(() => {
    mockProviderOverrides = { [providerId]: { apiKeys: ['key-a', 'key-b'] } };
    mockSetProviderOverrides = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    settings = undefined;
  });

  it('has the persisted keys on the first frame', () => {
    const first = mount();

    expect(first.entries.map((entry) => entry.key)).toEqual(['key-a', 'key-b']);
    expect(first.entries.every((entry) => !entry.isNew)).toBe(true);
  });

  it('starts empty for a provider with no stored keys', () => {
    mockProviderOverrides = {};

    expect(mount().entries).toEqual([]);
  });

  // The rows used to be rebuilt from the preference store on every push, with a filter to
  // hand-preserve the row being typed into. Seeding once removes that whole problem.
  it('keeps an added row when an unrelated preference write lands', () => {
    mount();

    act(() => current().addApiKey());
    act(() => current().updateApiKey(current().entries[2].id, 'key-c'));
    pushPreference({ [providerId]: { apiKeys: ['key-a', 'key-b'] }, exa: { apiKeys: ['other'] } });

    expect(keys()).toEqual(['key-a', 'key-b', 'key-c']);
  });

  it('adds at most one blank row at a time', () => {
    mount();

    act(() => current().addApiKey());
    act(() => current().addApiKey());

    expect(current().entries).toHaveLength(3);
    expect(current().entries.filter((entry) => entry.isNew)).toHaveLength(1);
  });

  it('promotes a saved row to an ordinary one without changing its id', () => {
    mount();

    act(() => current().addApiKey());
    const addedId = current().entries[2].id;
    act(() => current().updateApiKey(addedId, 'key-c'));
    act(() => current().promoteApiKey(addedId));

    expect(current().entries[2]).toEqual({ id: addedId, isNew: false, key: 'key-c' });
  });

  it('writes the normalized keys through to the preference', async () => {
    const first = mount();

    await act(async () => {
      await first.saveApiKeys([
        { id: 'a', isNew: false, key: 'key-a' },
        { id: 'b', isNew: true, key: '  ' },
        { id: 'c', isNew: false, key: 'key-c' },
      ]);
    });

    expect(mockSetProviderOverrides).toHaveBeenCalledWith({
      [providerId]: { apiKeys: ['key-a', 'key-c'] },
    });
  });

  it('removes a row', () => {
    mount();

    act(() => current().removeApiKey(current().entries[0].id));

    expect(keys()).toEqual(['key-b']);
  });

  it('rebuilds from the stored keys when the screen is reopened', () => {
    mount();
    act(() => current().removeApiKey(current().entries[0].id));
    act(() => renderer?.unmount());

    expect(mount().entries.map((entry) => entry.key)).toEqual(['key-a', 'key-b']);
  });
});
