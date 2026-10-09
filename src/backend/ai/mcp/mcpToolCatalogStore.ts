import type { ListToolsResult } from '@ai-sdk/mcp';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as z from 'zod';

import { loggerService } from '@/shared/core/logger/LoggerService';
import { normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

const logger = loggerService.withContext('McpToolCatalogStore');

/**
 * Last complete `tools/list` result per server, kept in the app cache directory
 * so a send never waits on discovery once a server has been listed once.
 *
 * The file is loseable: the OS may purge the cache directory, and a missing or
 * unreadable file only means one live discovery. It records a fingerprint of
 * the connection configuration rather than the configuration itself, so custom
 * request headers never reach disk. Execution still rechecks the stored server
 * row and lists the live catalog before the first call of a connection, so a
 * stale file can only make the model ask for a tool that then fails closed.
 */
const StoredMcpToolCatalogSchema = z.object({
  connectionKey: z.string().min(1),
  discoveredAt: z.number().int().nonnegative(),
  serverId: z.string().min(1),
  tools: z.array(z.looseObject({ name: z.string().min(1) })),
  version: z.literal(1),
});

export type StoredMcpToolCatalog = Omit<z.infer<typeof StoredMcpToolCatalogSchema>, 'tools'> & {
  tools: ListToolsResult['tools'];
};

type McpConnectionFingerprintInput = {
  origin?: 'builtin' | 'remote';
  builtinId?: string;
  authorizationId?: string;
  endpointUrl: string | null;
  headers?: Readonly<Record<string, string>>;
};

const SAFE_SERVER_ID = /^[A-Za-z0-9_-]+$/;

function catalogDirectory(): Directory {
  return new Directory(Paths.cache, 'mcp-tool-catalog');
}

function catalogFile(serverId: string): File | undefined {
  if (!SAFE_SERVER_ID.test(serverId)) return undefined;
  return new File(catalogDirectory(), `${serverId}.json`);
}

/**
 * Stable identity of a connection configuration. Bundled plugins are identified
 * by plugin and grant; remote servers by a digest of endpoint and normalized
 * headers, so a rotated header value invalidates the file without storing it.
 */
export async function createMcpConnectionKey(
  config: McpConnectionFingerprintInput,
): Promise<string> {
  if (config.origin === 'builtin') {
    return `builtin:${config.builtinId ?? ''}:${config.authorizationId ?? ''}`;
  }
  const headers = normalizeMcpHeaders(config.headers);
  const material = JSON.stringify([
    config.endpointUrl ?? '',
    Object.keys(headers)
      .sort()
      .map((name) => [name.toLowerCase(), headers[name]]),
  ]);
  return `remote:${await digestStringAsync(CryptoDigestAlgorithm.SHA256, material)}`;
}

export async function readMcpToolCatalog(
  serverId: string,
): Promise<StoredMcpToolCatalog | undefined> {
  const file = catalogFile(serverId);
  if (!file?.exists) return undefined;
  try {
    const stored = StoredMcpToolCatalogSchema.parse(JSON.parse(await file.text()));
    if (stored.serverId !== serverId) return undefined;
    return stored as StoredMcpToolCatalog;
  } catch (error) {
    logger.warn('Dropping an unreadable MCP tool catalog file', error as Error, { serverId });
    deleteMcpToolCatalog(serverId);
    return undefined;
  }
}

/** Write through a temporary file so an interrupted write never leaves a partial catalog. */
export async function writeMcpToolCatalog(catalog: StoredMcpToolCatalog): Promise<void> {
  const destination = catalogFile(catalog.serverId);
  if (!destination) return;
  try {
    destination.parentDirectory.create({ intermediates: true, idempotent: true });
    const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
    temporary.create({ overwrite: true });
    temporary.write(JSON.stringify(catalog));
    await temporary.move(destination, { overwrite: true });
  } catch (error) {
    logger.warn('Could not save the MCP tool catalog', error as Error, {
      serverId: catalog.serverId,
    });
  }
}

export function deleteMcpToolCatalog(serverId: string): void {
  const file = catalogFile(serverId);
  if (!file?.exists) return;
  try {
    file.delete();
  } catch (error) {
    logger.warn('Could not remove the MCP tool catalog', error as Error, { serverId });
  }
}
