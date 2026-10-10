import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntry, discardInternalEntries } from '@/backend/services/file/fileStorage';
import { fileEntryUrl, type FileEntry } from '@/shared/data/types/file';

import type { RuntimeArtifact, RuntimeToolResult } from '../agent/runtime/types';

/** Preserve bounded binary results as managed files before the text envelope is truncated. */
export async function storeMcpResultFiles(
  result: unknown,
  signal: AbortSignal,
): Promise<{
  value: unknown;
  artifacts: RuntimeArtifact[];
  images?: RuntimeToolResult['modelImages'];
}> {
  if (
    !result ||
    typeof result !== 'object' ||
    !('content' in result) ||
    !Array.isArray(result.content)
  )
    return { value: result, artifacts: [] };
  const entries: FileEntry[] = [];
  const images: NonNullable<RuntimeToolResult['modelImages']> = [];
  const content: unknown[] = [];
  let remaining = 8 * 1024 * 1024;
  try {
    for (const item of result.content.slice(0, 64)) {
      signal.throwIfAborted();
      const resource = item?.type === 'resource' ? item.resource : undefined;
      const data =
        resource?.blob ?? (['image', 'audio'].includes(item?.type) ? item.data : undefined);
      const mediaType = resource?.mimeType ?? item?.mimeType;
      if (typeof data !== 'string' || typeof mediaType !== 'string') {
        content.push(item);
        continue;
      }
      const bytes = data.length * 0.75;
      if (
        bytes > remaining ||
        !/^[a-zA-Z0-9+/]*={0,2}$/.test(data) ||
        !/^[\w.+-]+\/[\w.+-]+$/.test(mediaType)
      ) {
        content.push({
          type: 'text',
          text: '[MCP binary content omitted: invalid format or size limit]',
        });
        continue;
      }
      remaining -= bytes;
      try {
        const entry = await createInternalEntry(
          fileEntryService,
          { source: 'base64', data, mediaType, provenance: 'generated' },
          signal,
        );
        entries.push(entry);
        if (item.type === 'image')
          images.push({ fileEntryId: entry.id, mimeType: mediaType, data });
        content.push({
          type: 'resource_link',
          uri: fileEntryUrl(entry.id),
          name: entry.filename,
          mimeType: mediaType,
        });
      } catch {
        signal.throwIfAborted();
        content.push({ type: 'text', text: '[MCP binary content could not be saved]' });
      }
    }
    signal.throwIfAborted();
    return {
      value: { ...result, content },
      images,
      artifacts: entries.map((entry) => ({
        ref: { kind: 'managed-file', fileEntryId: entry.id },
        mediaType: entry.mediaType,
        name: entry.filename,
        kind: 'created',
      })),
    };
  } catch (error) {
    await discardInternalEntries(fileEntryService, entries);
    throw error;
  }
}
