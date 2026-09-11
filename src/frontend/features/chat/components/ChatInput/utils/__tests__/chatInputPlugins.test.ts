import type { PluginCatalogEntry, PluginConnection } from '@/shared/data/types/plugin';

import { getConnectedChatInputPlugins } from '../chatInputPlugins';

const catalog: PluginCatalogEntry[] = ['feishu', 'github', 'amap'].map((id) => ({
  id,
  icon: id,
  links: { credentials: '', website: '', privacy: '' },
  authMethods: [],
}));

function connection(
  pluginId: string,
  status?: 'connected' | 'needs-reauthorization' | 'unavailable',
): PluginConnection {
  return {
    pluginId,
    serverId: `server-${pluginId}`,
    accountLabel: pluginId,
    connectedAt: '2026-09-11T00:00:00.000Z',
    ...(status ? { authorization: { status } } : {}),
  };
}

describe('connected chat input plugins', () => {
  test('has no menu entries before loading or after every account disconnects', () => {
    expect(getConnectedChatInputPlugins()).toEqual([]);
    expect(getConnectedChatInputPlugins(catalog, [])).toEqual([]);
    expect(getConnectedChatInputPlugins(undefined, [connection('feishu')])).toEqual([]);
  });

  test('shows connected catalog entries in catalog order, including older connection metadata', () => {
    expect(
      getConnectedChatInputPlugins(catalog, [
        connection('amap', 'connected'),
        connection('feishu'),
        connection('unknown', 'connected'),
      ]),
    ).toEqual([
      { id: 'feishu', icon: 'feishu', serverId: 'server-feishu' },
      { id: 'amap', icon: 'amap', serverId: 'server-amap' },
    ]);
  });

  test('hides unavailable accounts and accounts requiring reauthorization', () => {
    expect(
      getConnectedChatInputPlugins(catalog, [
        connection('feishu', 'needs-reauthorization'),
        connection('github', 'unavailable'),
      ]),
    ).toEqual([]);
  });
});
