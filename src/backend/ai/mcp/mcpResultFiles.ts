import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntry, discardInternalEntries } from '@/backend/services/file/fileStorage';
import { mcpModelTextOverflow } from '@/shared/contracts/mcpContent';
import { fileEntryUrl, type FileEntry } from '@/shared/data/types/file';
import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import type { RuntimeArtifact, RuntimeToolResult } from '../agent/runtime/types';

const FULL_TEXT_FILENAME = 'mcp-result.txt';

/**
 * Preserve what the bounded envelopes drop: binary results as managed files before the text
 * envelope is truncated, and model text over its budget as a file `read_file` can page through.
 */
export async function storeMcpResultFiles(
  result: unknown,
  signal: AbortSignal,
): Promise<{
  value: unknown;
  artifacts: RuntimeArtifact[];
  images?: RuntimeToolResult['modelImages'];
  fullTextFileEntryId?: string;
}> {
  const entries: FileEntry[] = [];
  const images: NonNullable<RuntimeToolResult['modelImages']> = [];
  let value = result;
  let fullTextFileEntryId: string | undefined;
  try {
    if (
      result &&
      typeof result === 'object' &&
      'content' in result &&
      Array.isArray(result.content)
    ) {
      const content: unknown[] = [];
      let remaining = 8 * 1024 * 1024;
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
      value = { ...result, content };
    }
    const fullText = mcpModelTextOverflow(result);
    // A file `read_file` refuses would be a pointer to nothing.
    if (
      fullText !== undefined &&
      new TextEncoder().encode(fullText).byteLength <= MAX_TEXT_ATTACHMENT_BYTES
    ) {
      try {
        const entry = await createInternalEntry(
          fileEntryService,
          {
            source: 'text',
            data: fullText,
            mediaType: 'text/plain',
            name: FULL_TEXT_FILENAME,
            provenance: 'generated',
          },
          signal,
        );
        entries.push(entry);
        fullTextFileEntryId = entry.id;
      } catch {
        // The truncation note still states the sizes; only the pointer to the rest is lost.
        signal.throwIfAborted();
      }
    }
    signal.throwIfAborted();
    return {
      value,
      images,
      artifacts: entries.map((entry) => ({
        ref: { kind: 'managed-file', fileEntryId: entry.id },
        mediaType: entry.mediaType,
        name: entry.filename,
        kind: 'created',
      })),
      ...(fullTextFileEntryId ? { fullTextFileEntryId } : {}),
    };
  } catch (error) {
    await discardInternalEntries(fileEntryService, entries);
    throw error;
  }
}
