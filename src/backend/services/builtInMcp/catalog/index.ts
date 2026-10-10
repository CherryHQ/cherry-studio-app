import { createCatalogPlugin } from './createCatalogPlugin';
import { mcpServerCatalog } from './mcpServerCatalog';

/** Every curated hosted server, materialized as a registered plugin definition. */
export const catalogPlugins = mcpServerCatalog.map(createCatalogPlugin);

export { createCatalogPlugin } from './createCatalogPlugin';
export { mcpServerCatalog, mcpCatalogById, type McpCatalogEntry } from './mcpServerCatalog';
