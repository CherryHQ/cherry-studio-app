import { File } from 'expo-file-system';

import { writeZipFile } from '@/backend/utils/zipWriter';

import type { StagedSource } from './types';

export async function writeBundleZip(
  destination: File,
  entries: readonly { name: string; content: string }[],
  sources: readonly StagedSource[],
  signal?: AbortSignal,
): Promise<void> {
  await writeZipFile(
    destination,
    [
      ...entries.map(({ name, content }) => ({
        name,
        bytes: new TextEncoder().encode(content),
        compression: 6 as const,
      })),
      ...sources.map((source) => ({
        name: source.archiveName,
        file: new File(source.path),
        compression: 6 as const,
      })),
    ],
    { signal },
  );
}
