import type { PluginCatalogEntry, PluginConnection } from '@/shared/data/types/plugin';

export type ChatInputPlugin = Pick<PluginCatalogEntry, 'id' | 'icon'> & { serverId: string };

/** One connected list controls both the add-menu entry and the selectable rows. */
export function getConnectedChatInputPlugins(
  catalog: readonly PluginCatalogEntry[] = [],
  connections: readonly PluginConnection[] = [],
): ChatInputPlugin[] {
  return catalog.flatMap((entry) => {
    const connection = connections.find(
      (item) =>
        item.pluginId === entry.id &&
        (!item.authorization || item.authorization.status === 'connected'),
    );
    return connection ? [{ id: entry.id, icon: entry.icon, serverId: connection.serverId }] : [];
  });
}
