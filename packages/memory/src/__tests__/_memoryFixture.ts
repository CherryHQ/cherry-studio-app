import { createHash, randomUUID } from 'node:crypto';

import type { MemoryPlatform } from '../memoryPlatform';
import { MemoryService, type MemoryAuthority, type MemoryScope } from '../MemoryService';

export function memoryFixture() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  let now = 1_000;
  const faults: { replace?: (root: string, path: string, bytes: Uint8Array | null) => void } = {};
  const platform: MemoryPlatform = {
    hash: (bytes) => createHash('sha256').update(bytes).digest('hex'),
    randomUUID,
    now: () => now++,
    caseSensitive: false,
    files: {
      ensureDirectory: async (root, path) => {
        directories.add(root + '/' + path);
      },
      assertPath: async () => {},
      list: async (root, path) => {
        const prefix = root + '/' + (path ? path + '/' : '');
        return [...files.keys()]
          .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map((key) => ({ name: key.slice(prefix.length), directory: false }));
      },
      read: async (root, path) => files.get(root + '/' + path)?.slice() ?? null,
      replace: async (root, path, bytes, assertCurrent) => {
        assertCurrent();
        faults.replace?.(root, path, bytes);
        assertCurrent();
        if (bytes === null) files.delete(root + '/' + path);
        else files.set(root + '/' + path, bytes.slice());
      },
      identity: async (root, path) =>
        files.has(root + '/' + path) ? (root + '/' + path).toLowerCase() : null,
    },
  };
  const service = new MemoryService({
    platform,
    roots: (scope) => ({
      active: scope.kind === 'shared' ? 'shared' : 'agent/' + scope.agentId,
      backup: scope.kind === 'shared' ? 'backups/shared' : 'backups/agent/' + scope.agentId,
    }),
  });
  function open(scope: MemoryScope = { kind: 'shared' }, checks: Partial<MemoryAuthority> = {}) {
    return service.open({
      scope,
      assertAuthorized: () => undefined,
      assertWritable: () => {},
      ...checks,
    });
  }
  const set = (path: string, text: string) => files.set(path, new TextEncoder().encode(text));
  const text = (path: string) =>
    files.has(path) ? new TextDecoder().decode(files.get(path)) : null;
  return { service, platform, files, faults, open, set, text };
}
