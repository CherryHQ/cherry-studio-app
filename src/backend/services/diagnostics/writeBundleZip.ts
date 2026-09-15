import { File, FileMode } from 'expo-file-system';
import { Zip, ZipDeflate } from 'fflate';

import { yieldToRuntime } from './diagnosticFiles';
import type { StagedSource } from './types';

export async function writeBundleZip(
  destination: File,
  entries: readonly { name: string; content: string }[],
  sources: readonly StagedSource[],
  signal?: AbortSignal,
): Promise<void> {
  destination.create();
  const writer = destination.open();
  let failure: Error | undefined;
  let finished = false;
  const zip = new Zip((error, bytes, final) => {
    if (error) {
      failure = error;
      return;
    }
    try {
      writer.writeBytes(bytes);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    finished = final;
  });
  const add = (name: string) => {
    if (
      name.includes('\\') ||
      name.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    )
      throw new Error('Invalid ZIP entry name');
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    return entry;
  };
  try {
    for (const { name, content } of entries) {
      add(name).push(new TextEncoder().encode(content), true);
      if (failure) throw failure;
    }
    for (const source of sources) {
      const file = new File(source.path);
      const reader = file.open(FileMode.ReadOnly);
      try {
        const entry = add(source.archiveName);
        let remaining = file.size;
        while (remaining > 0) {
          signal?.throwIfAborted();
          const bytes = reader.readBytes(Math.min(64 * 1024, remaining));
          if (!bytes.length) throw new Error('Staged diagnostic file was truncated');
          remaining -= bytes.length;
          entry.push(bytes, false);
          if (failure) throw failure;
          await yieldToRuntime();
        }
        entry.push(new Uint8Array(), true);
      } finally {
        reader.close();
      }
    }
    zip.end();
    if (failure) throw failure;
    if (!finished) throw new Error('Diagnostic ZIP did not finish');
  } finally {
    zip.terminate();
    writer.close();
  }
}
