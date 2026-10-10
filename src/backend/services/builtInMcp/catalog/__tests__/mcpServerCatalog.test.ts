import { PluginIdSchema } from '@/shared/data/types/plugin';

import { createCatalogPlugin } from '../catalog/createCatalogPlugin';
import { mcpCatalogById, mcpServerCatalog } from '../catalog/mcpServerCatalog';
import { getBuiltInPluginCatalog, getPluginDefinition } from '../pluginRegistry';

describe('remote MCP catalog', () => {
  test('every entry has a unique, well-formed plugin id', () => {
    const ids = mcpServerCatalog.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(PluginIdSchema.safeParse(id).success).toBe(true);
    }
    expect(mcpCatalogById.size).toBe(mcpServerCatalog.length);
  });

  test('every entry declares at least one authorization method and a hosted endpoint', () => {
    for (const entry of mcpServerCatalog) {
      expect(entry.auth.length).toBeGreaterThan(0);
      expect(() => new URL(entry.endpointUrl)).not.toThrow();
      expect(new URL(entry.endpointUrl).protocol).toBe('https:');
    }
  });

  test('each entry materializes into a registered plugin definition', () => {
    for (const entry of mcpServerCatalog) {
      const definition = getPluginDefinition(entry.id);
      expect(definition).toBeDefined();
      expect(definition?.catalog.id).toBe(entry.id);
      expect(definition?.catalog.name).toBe(entry.name);
      expect(definition?.authMethods.length).toBeGreaterThan(0);
    }
  });

  test('the registry catalog exposes the curated entries with inline display copy', () => {
    const catalog = getBuiltInPluginCatalog();
    for (const entry of mcpServerCatalog) {
      const projected = catalog.find((item) => item.id === entry.id);
      expect(projected).toBeDefined();
      expect(projected?.name).toBe(entry.name);
      expect(projected?.summary).toBe(entry.summary);
    }
  });

  test('a catalog plugin admits discovered tools as approval-gated writes', () => {
    const entry = mcpServerCatalog[0];
    const plugin = createCatalogPlugin(entry);
    expect(plugin.tools).toEqual({});
    expect(plugin.acceptsDiscoveredTool?.('anything')).toBe(true);
  });
});
