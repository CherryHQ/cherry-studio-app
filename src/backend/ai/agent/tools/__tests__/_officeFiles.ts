import type { JsSandbox } from '@/backend/services/jsSandbox';
import type { FileEntry } from '@/shared/data/types/file';

import type { ManagedFileFact } from '../../resources/managedFileResolver';
import type { OfficeFiles } from '../officeToolResources';

/** In-memory Office file port: managed files at `file:///managed/<id>`, outputs in `file:///cache/`. */
export function fakeOfficeFiles(facts: readonly ManagedFileFact[], entry: FileEntry) {
  let outputs = 0;
  const sizes = new Map(facts.map((fact) => [`file:///managed/${fact.fileEntryId}`, fact.size]));
  return {
    resolveAvailable: jest.fn(async () => new Map(facts.map((fact) => [fact.fileEntryId, fact]))),
    localUri: jest.fn((file: ManagedFileFact) => `file:///managed/${file.fileEntryId}`),
    prepareImage: jest.fn<ReturnType<OfficeFiles['prepareImage']>, [ManagedFileFact]>(
      async () => undefined,
    ),
    size: jest.fn(
      (uri: string) => sizes.get(uri) ?? (uri.startsWith('file:///cache/') ? 4 : undefined),
    ),
    hash: jest.fn(async (uri: string) => (uri.startsWith('file:///cache/') ? 'b' : 'a').repeat(64)),
    temporaryUri: jest.fn((extension: string) => `file:///cache/${++outputs}.${extension}`),
    discard: jest.fn(),
    createFileEntry: jest.fn(async () => entry),
    sizes,
  } satisfies OfficeFiles & { sizes: Map<string, number> };
}

/** A file-capable sandbox whose job reports writing a 4-byte file. */
export function fakeOfficeSandbox(result = '4'): JsSandbox & { run: jest.Mock } {
  return {
    files: true,
    run: jest.fn(async ({ onSettled }: Parameters<JsSandbox['run']>[0]) => {
      onSettled?.();
      return { status: 'ok' as const, result, logs: '', logsTruncated: false, durationMs: 1 };
    }),
  };
}
