import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { subscribeCatalogDirectoryChanges } from '../conversationCatalogCache';

test('pairing changes evict idle desktop catalogs while active readers and local data retain ownership', () => {
  const query = new QueryClient();
  const local = ['conversation-catalog', { kind: 'local' }, 'local', 'agents'];
  const idle = [
    'conversation-catalog',
    { kind: 'desktop', connectionId: 'idle' },
    'grant',
    'agents',
  ];
  const active = [
    'conversation-catalog',
    { kind: 'desktop', connectionId: 'active' },
    'grant',
    'agents',
  ];
  for (const key of [local, idle, active]) query.setQueryData(key, { items: ['private'] });
  let changed!: (paths: readonly string[]) => void;
  const unsubscribe = jest.fn();
  const release = subscribeCatalogDirectoryChanges(
    {
      subscribeChanges: (listener) => {
        changed = listener;
        return unsubscribe;
      },
    },
    query,
  );
  const observer = new QueryObserver(query, {
    queryKey: active,
    queryFn: async () => ({ items: ['private'] }),
    staleTime: Infinity,
    enabled: false,
  });
  const stopObserving = observer.subscribe(() => {});
  changed(['/agents']);
  expect(query.getQueryData(idle)).toBeDefined();
  changed(['/desktop-connections']);
  expect(query.getQueryData(idle)).toBeUndefined();
  expect(query.getQueryData(local)).toBeDefined();
  expect(query.getQueryData(active)).toBeDefined();
  stopObserving();
  release?.();
  query.clear();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
