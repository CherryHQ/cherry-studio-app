import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry } from '@/shared/domain/provider';

import { getProviderApiServiceApiKeysDirtyState } from '../../utils/providerApiServiceDirtyState';
import { useProviderApiServiceApiKeysDraft } from '../useProviderApiServiceApiKeysDraft';

type ApiKeysDraft = ReturnType<typeof useProviderApiServiceApiKeysDraft>;

const persistedApiKeys: readonly ApiKeyEntry[] = [
  { id: 'key-a', isEnabled: true, key: 'sk-a' },
  { id: 'key-b', isEnabled: false, key: 'sk-b' },
];

describe('useProviderApiServiceApiKeysDraft', () => {
  let renderer: ReactTestRenderer | undefined;
  let draft: ApiKeysDraft | undefined;

  function Probe({ apiKeys }: { apiKeys: readonly ApiKeyEntry[] }) {
    draft = useProviderApiServiceApiKeysDraft(apiKeys);
    return null;
  }

  function mount(apiKeys: readonly ApiKeyEntry[]) {
    act(() => {
      renderer = create(<Probe apiKeys={apiKeys} />);
    });

    return current();
  }

  function refetch(apiKeys: readonly ApiKeyEntry[]) {
    act(() => {
      renderer?.update(<Probe apiKeys={apiKeys} />);
    });
  }

  function current() {
    if (!draft) {
      throw new Error('API keys draft was not rendered.');
    }

    return draft;
  }

  function isDirty(apiKeys: readonly ApiKeyEntry[]) {
    return getProviderApiServiceApiKeysDirtyState({ apiKeys, entries: current().entries });
  }

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    draft = undefined;
  });

  // The root cause of the detail-screen layout break was a draft that only existed
  // one commit after its data arrived. Entering with loaded keys must need no second
  // commit at all.
  it('has the persisted keys on the first frame', () => {
    expect(mount(persistedApiKeys).entries).toEqual([
      { id: 'key-a', isEnabled: true, key: 'sk-a' },
      { id: 'key-b', isEnabled: false, key: 'sk-b' },
    ]);
    expect(isDirty(persistedApiKeys)).toBe(false);
  });

  it('does not alias the persisted entries', () => {
    mount(persistedApiKeys);

    act(() => current().updateKey('key-a', 'sk-mutated'));

    expect(persistedApiKeys[0]).toEqual({ id: 'key-a', isEnabled: true, key: 'sk-a' });
  });

  it('keeps an uncommitted edit when the server keys refetch', () => {
    mount(persistedApiKeys);

    act(() => current().updateKey('key-a', 'sk-local-edit'));
    refetch([{ id: 'key-c', isEnabled: true, key: 'sk-from-elsewhere' }]);

    expect(current().entries).toEqual([
      { id: 'key-a', isEnabled: true, key: 'sk-local-edit' },
      { id: 'key-b', isEnabled: false, key: 'sk-b' },
    ]);
    expect(isDirty([{ id: 'key-c', isEnabled: true, key: 'sk-from-elsewhere' }])).toBe(true);
  });

  // A save resolves only after its query invalidation settles, so the saved value is
  // already in the cache — the draft needs no baseline bookkeeping to come clean.
  it('settles clean once the saved keys come back from the query', () => {
    mount(persistedApiKeys);

    act(() => current().updateKey('key-a', 'sk-saved'));
    expect(isDirty(persistedApiKeys)).toBe(true);

    const savedApiKeys = [
      { id: 'key-a', isEnabled: true, key: 'sk-saved' },
      { id: 'key-b', isEnabled: false, key: 'sk-b' },
    ];
    refetch(savedApiKeys);

    expect(isDirty(savedApiKeys)).toBe(false);
  });

  it('rebuilds from the persisted keys when the screen is reopened', () => {
    mount(persistedApiKeys);
    act(() => current().updateKey('key-a', 'sk-abandoned'));
    act(() => renderer?.unmount());

    expect(mount(persistedApiKeys).entries).toEqual([
      { id: 'key-a', isEnabled: true, key: 'sk-a' },
      { id: 'key-b', isEnabled: false, key: 'sk-b' },
    ]);
  });

  it('keeps a blank added row without counting it as unsaved work', () => {
    mount(persistedApiKeys);

    act(() => current().addKey());

    expect(current().entries).toHaveLength(3);
    expect(current().entries[2]).toMatchObject({ isEnabled: true, key: '' });
    expect(isDirty(persistedApiKeys)).toBe(false);
  });

  it('toggles and removes entries', () => {
    mount(persistedApiKeys);

    act(() => current().updateKeyEnabled('key-b', true));
    expect(current().entries[1]).toEqual({ id: 'key-b', isEnabled: true, key: 'sk-b' });
    expect(isDirty(persistedApiKeys)).toBe(true);

    act(() => current().removeKey('key-b'));
    expect(current().entries).toEqual([{ id: 'key-a', isEnabled: true, key: 'sk-a' }]);
  });
});
