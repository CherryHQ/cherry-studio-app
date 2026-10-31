import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

import {
  prepareFileAttachments,
  type PrepareFileAttachmentsInput,
} from '@/backend/services/file/prepareFileAttachments';

import type { RuntimeDocumentAttachmentPart, RuntimeTextAttachmentPart } from '../runtime';

/** Agent-only projection: generic file preparation never constructs trusted runtime envelopes. */
export async function resolveManagedContentAttachments(
  input: PrepareFileAttachmentsInput,
): Promise<ReadonlyMap<string, RuntimeTextAttachmentPart | RuntimeDocumentAttachmentPart>> {
  // Direct images participate in shared admission/budgets even though the Host materializes them later.
  const prepared = await prepareFileAttachments(input);
  const result = new Map<string, RuntimeTextAttachmentPart | RuntimeDocumentAttachmentPart>();
  for (const [id, attachment] of prepared) {
    const { content, file, report } = attachment;
    const metadata = {
      fileEntryId: id,
      mediaType: file.mediaType,
      name: file.name,
      trust: 'untrusted-user-content' as const,
      attachmentReport: report,
    };
    if (report.mode === 'audio') {
      result.set(id, {
        ...metadata,
        type: 'text-attachment',
        text: 'Audio recording attached as a file reference. Audio bytes have not been sent to the model. If transcribe_audio is available, use it and then read_file to access the generated transcript. Otherwise ask the user to transcribe it from the audio file menu after configuring audio-file transcription in Voice settings.',
        truncated: false,
      });
      continue;
    }
    if (!content) continue;
    if (content.kind === 'text') {
      result.set(id, {
        ...metadata,
        type: 'text-attachment',
        text: content.text,
        truncated: report.sourceTruncated || report.requestTruncated,
      });
    } else {
      const { kind: _kind, assets, ...document } = content;
      const images = assets.map((asset) => {
        input.signal.throwIfAborted();
        const mediaType = asset.contentType!.toLowerCase();
        return {
          assetRef: asset.assetRef,
          mediaType,
          uri: `data:${mediaType};base64,${convertUint8ArrayToBase64(new Uint8Array(asset.bytes))}`,
        };
      });
      result.set(id, { ...metadata, ...document, type: 'document-attachment', images });
    }
  }
  input.signal.throwIfAborted();
  return result;
}
