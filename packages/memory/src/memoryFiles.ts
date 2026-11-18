import type { MemoryPlatform } from './memoryPlatform';

export const MEMORY_ENTRY = 'MEMORY.md';
export const MEMORY_TOPICS = '.memories';
export const MEMORY_MAX_BYTES = 25_000;
export const MEMORY_MAX_LINES = 200;
export const MEMORY_WARNING_BYTES = 20_000;
export const MEMORY_WARNING_LINES = 160;

export class MemoryError extends Error {
  constructor(
    readonly code:
      | 'invalid-path'
      | 'conflict'
      | 'limit'
      | 'invalid-receipt'
      | 'backup-capacity'
      | 'invalid-backup',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

export function assertMemoryTarget(relative: string): void {
  if (relative === MEMORY_ENTRY) return;
  const parts = relative.split('/');
  const name = parts[1];
  if (
    parts.length !== 2 ||
    parts[0] !== MEMORY_TOPICS ||
    !name ||
    name.startsWith('.') ||
    !name.endsWith('.md') ||
    /[\\<>:"|?*]/.test(name) ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
    /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
  ) {
    throw new MemoryError('invalid-path', 'The target is not a managed memory file');
  }
}

export function memoryLineCount(content: string): number {
  if (!content) return 0;
  const lines = content.split('\n').length;
  return content.endsWith('\n') ? lines - 1 : lines;
}

export function assertMemoryContent(relative: string, content: string): void {
  if (
    new TextEncoder().encode(content).length > MEMORY_MAX_BYTES ||
    (relative === MEMORY_ENTRY && memoryLineCount(content) > MEMORY_MAX_LINES)
  ) {
    throw new MemoryError('limit', 'Memory content exceeds the entry or topic limit');
  }
}

export function memoryEntryPreview(content: string): { content: string; truncated: boolean } {
  let bytes = 0;
  const completeLines: string[] = [];
  for (const line of content.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const size = new TextEncoder().encode(line).length;
    if (completeLines.length === MEMORY_MAX_LINES || bytes + size > MEMORY_MAX_BYTES) break;
    completeLines.push(line);
    bytes += size;
  }
  const preview = completeLines.join('');
  return { content: preview, truncated: preview !== content };
}

export function createMemoryFiles(platform: MemoryPlatform) {
  const fs = platform.files;
  return {
    hash(bytes: Uint8Array | null): string | null {
      return bytes === null ? null : platform.hash(bytes);
    },
    async assertPath(root: string, relative: string) {
      await fs.assertPath(root, relative);
    },
    async initialize(root: string, createEntry = true) {
      await fs.ensureDirectory(root, '');
      await fs.ensureDirectory(root, MEMORY_TOPICS);
      if (createEntry && (await fs.read(root, MEMORY_ENTRY)) === null)
        await fs.replace(root, MEMORY_ENTRY, new Uint8Array(), () => undefined);
    },
    async read(root: string, relative: string) {
      await fs.assertPath(root, relative);
      const bytes = await fs.read(root, relative);
      if (bytes && bytes.length > 20 * 1024 * 1024)
        throw new MemoryError('limit', 'Memory file exceeds the complete-read budget');
      return bytes;
    },
    async write(
      root: string,
      relative: string,
      bytes: Uint8Array | null,
      assertCurrent = () => {},
    ) {
      await fs.assertPath(root, relative);
      await fs.replace(root, relative, bytes, assertCurrent);
    },
    async list(root: string): Promise<string[]> {
      const files: string[] = [];
      if ((await fs.read(root, MEMORY_ENTRY)) !== null) files.push(MEMORY_ENTRY);
      for (const entry of await fs.list(root, MEMORY_TOPICS)) {
        const target = `${MEMORY_TOPICS}/${entry.name}`;
        try {
          assertMemoryTarget(target);
        } catch {
          continue;
        }
        if (!entry.directory) {
          await fs.assertPath(root, target);
          files.push(target);
        }
      }
      return files.sort();
    },
  };
}
export type MemoryFiles = ReturnType<typeof createMemoryFiles>;
export const encodeMemoryText = (text: string): Uint8Array => new TextEncoder().encode(text);
export const decodeMemoryText = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
