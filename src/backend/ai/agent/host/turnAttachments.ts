/**
 * Turn-level attachment admission and materialization for the Mobile Agent
 * Host. This module owns the protocol-error projection of attachment
 * failures; the primitives under `../resources` stay protocol-free.
 */

import {
  AgentProtocolError,
  type AgentErrorView,
  type AgentInputPart,
  type AgentMessageView,
} from '@/shared/contracts/agent';
import { FileEntryIdSchema } from '@/shared/data/types/file';
import { isAiSupportedImageMediaType } from '@/shared/utils/imageFileTypes';

import { findImageAttachmentLimit, type ImageAttachmentLimit } from '../resources/imageAttachments';
import type {
  ManagedFileFact,
  ManagedFileResolver,
  TurnResourceLedger,
} from '../resources/managedFileResolver';
import {
  isSupportedTextAttachment,
  resolveManagedTextAttachments,
  TextAttachmentError,
} from '../resources/textAttachments';
import { raceAbort, unsupportedMediaNote } from '../runtime';
import type { AgentRuntime, RuntimeInputPart, RuntimeModelPreflight } from '../runtime';
import type { RuntimeAttachmentContents } from './turnRuntimeInput';

const NO_IMAGE_MEDIA_CAPABILITIES = { image: false, video: true, audio: true } as const;

function fail(code: AgentErrorView['code'], message: string, retryable = false): never {
  throw new AgentProtocolError({ code, message, retryable });
}

export type ResolvedManagedInput = {
  availableFiles: ReadonlyMap<string, ManagedFileFact>;
  inputFiles: ReadonlyMap<string, ManagedFileFact>;
  parts: AgentInputPart[];
};

/**
 * Verifies every referenced managed file against the resolver and rewrites the
 * input parts to the canonical file facts. Arbitrary paths and mismatched
 * metadata fail closed before any durable row exists.
 */
export async function resolveManagedInput(
  files: ManagedFileResolver,
  parts: AgentInputPart[],
  history: AgentMessageView[],
  signal: AbortSignal,
): Promise<ResolvedManagedInput> {
  const fileEntryIds = parts.flatMap((part) => {
    if (part.type !== 'file') {
      return [];
    }
    const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
    if (!parsed.success) {
      fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
    }
    return [parsed.data];
  });

  const historicalFileEntryIds = history.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== 'file' || part.purpose !== 'input-attachment') {
        return [];
      }
      const parsed = FileEntryIdSchema.safeParse(part.fileEntryId);
      return parsed.success ? [parsed.data] : [];
    }),
  );
  let availableFiles: Awaited<ReturnType<ManagedFileResolver['resolveAvailable']>> = new Map();
  if (fileEntryIds.length > 0 || historicalFileEntryIds.length > 0) {
    try {
      availableFiles = await raceAbort(
        files.resolveAvailable([...fileEntryIds, ...historicalFileEntryIds]),
        signal,
      );
    } catch {
      signal.throwIfAborted();
      fail('ATTACHMENT_UNAVAILABLE', 'An attached file could not be verified.');
    }
  }

  const inputFiles = new Map(
    fileEntryIds.flatMap((fileEntryId) => {
      const fact = availableFiles.get(fileEntryId);
      return fact ? [[fileEntryId, fact] as const] : [];
    }),
  );

  const canonicalParts = parts.map((part): AgentInputPart => {
    if (part.type !== 'file') {
      return part;
    }
    const fact = inputFiles.get(part.fileEntryId);
    if (!fact) {
      fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
    }
    if (part.mediaType !== fact.mediaType || (part.name !== undefined && part.name !== fact.name)) {
      fail('ATTACHMENT_METADATA_MISMATCH', 'Attached file metadata could not be verified.');
    }
    return {
      type: 'file',
      fileEntryId: fact.fileEntryId,
      mediaType: fact.mediaType,
      name: fact.name,
    };
  });

  return { availableFiles, inputFiles, parts: canonicalParts };
}

/**
 * Request-level attachment gate: runtime capability, media admissibility, and
 * image limits — all before any network call. A model without image input
 * passes here; execution replaces those references with text notes.
 */
export function assertAttachmentRequestSupported(
  runtime: AgentRuntime,
  input: AgentInputPart[],
  history: AgentMessageView[],
  resources: TurnResourceLedger,
  model: RuntimeModelPreflight,
): void {
  let hasAttachments = false;
  const images = input.flatMap((part) => {
    if (part.type !== 'file') {
      return [];
    }
    const fact = resources.inputFiles.get(part.fileEntryId);
    if (!fact) {
      fail('ATTACHMENT_UNAVAILABLE', 'An attached file is no longer available.');
    }
    hasAttachments = true;
    if (isAiSupportedImageMediaType(fact.mediaType)) {
      return [fact];
    }
    if (isSupportedTextAttachment(fact)) {
      return [];
    }
    fail('ATTACHMENT_INVALID', unsupportedAttachmentMessage(fact));
  });

  for (const message of history) {
    for (const part of message.parts) {
      if (part.type !== 'file' || part.purpose !== 'input-attachment') {
        continue;
      }
      const fact = resources.availableFiles.get(part.fileEntryId);
      if (fact && isAiSupportedImageMediaType(fact.mediaType)) {
        hasAttachments = true;
        images.push(fact);
      } else if (fact && isSupportedTextAttachment(fact)) {
        hasAttachments = true;
      }
    }
  }

  if (!hasAttachments) {
    return;
  }
  if (!runtime.descriptor.capabilities.attachments) {
    fail('CAPABILITY_UNSUPPORTED', 'The selected runtime does not support file attachments.');
  }
  if (images.length === 0) {
    return;
  }
  if (!model.inputModalities.includes('image')) {
    // materializeRuntimeAttachments replaces these references with text notes
    // without reading image bytes.
    return;
  }

  const limit = findImageAttachmentLimit(images, model);
  if (limit) {
    fail('CAPABILITY_UNSUPPORTED', imageAttachmentLimitMessage(limit));
  }
}

/** Resolves bounded text attachment bodies, projecting failures to protocol errors. */
export async function resolveRuntimeTextAttachments(
  files: ManagedFileResolver,
  input: AgentInputPart[],
  history: AgentMessageView[],
  resources: TurnResourceLedger,
  signal: AbortSignal,
): Promise<RuntimeAttachmentContents> {
  const currentFileEntryIds = input.flatMap((part) =>
    part.type === 'file' ? [part.fileEntryId] : [],
  );
  const historicalFileEntryIds: string[] = [];
  for (let messageIndex = history.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const parts = history[messageIndex]?.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (part?.type === 'file' && part.purpose === 'input-attachment') {
        historicalFileEntryIds.push(part.fileEntryId);
      }
    }
  }

  try {
    return await resolveManagedTextAttachments({
      availableFiles: resources.availableFiles,
      currentFileEntryIds,
      historicalFileEntryIds,
      readBytes: (file, readSignal) => files.readAsBytes(file, readSignal),
      signal,
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof TextAttachmentError) {
      fail(
        error.failure === 'unavailable' ? 'ATTACHMENT_UNAVAILABLE' : 'ATTACHMENT_INVALID',
        error.message,
      );
    }
    fail('ATTACHMENT_UNAVAILABLE', 'An attached text file could not be resolved.');
  }
}

/**
 * Builds the execution-time attachment payload: validated text bodies plus
 * inline image data URLs when the model accepts images, or text omission
 * notes when it does not (image bytes are never read in that case).
 */
export async function materializeRuntimeAttachments(input: {
  files: ManagedFileResolver;
  history: AgentMessageView[];
  inputParts: AgentInputPart[];
  modelPreflight: RuntimeModelPreflight;
  resources: TurnResourceLedger;
  signal: AbortSignal;
  textAttachments: RuntimeAttachmentContents;
}): Promise<RuntimeAttachmentContents> {
  const { files, history, inputParts, modelPreflight, resources, signal, textAttachments } = input;
  const attachments = new Map(textAttachments);
  if (modelPreflight.inputModalities.includes('image')) {
    const images = await resolveRuntimeImages(files, resources, signal);
    for (const [fileEntryId, image] of images) {
      attachments.set(fileEntryId, image);
    }
    return attachments;
  }

  const omitImage = (fileEntryId: string, mediaType: string) => {
    const text = unsupportedMediaNote(mediaType, NO_IMAGE_MEDIA_CAPABILITIES);
    if (text) attachments.set(fileEntryId, { type: 'text', text });
  };
  for (const part of inputParts) {
    if (part.type === 'file') omitImage(part.fileEntryId, part.mediaType);
  }
  for (const message of history) {
    if (message.role !== 'user') continue;
    for (const part of message.parts) {
      if (part.type === 'file' && part.purpose === 'input-attachment') {
        omitImage(part.fileEntryId, part.mediaType);
      }
    }
  }
  return attachments;
}

async function resolveRuntimeImages(
  files: ManagedFileResolver,
  resources: TurnResourceLedger,
  signal: AbortSignal,
): Promise<RuntimeAttachmentContents> {
  const images = new Map<string, Extract<RuntimeInputPart, { type: 'file' }>>();
  for (const fact of resources.availableFiles.values()) {
    if (!isAiSupportedImageMediaType(fact.mediaType)) {
      continue;
    }
    try {
      const uri = await files.readAsDataUrl(fact, signal);
      signal.throwIfAborted();
      if (!uri || !uri.startsWith(`data:${fact.mediaType};base64,`)) {
        if (resources.inputFiles.has(fact.fileEntryId)) {
          throw new Error('A current managed image became unavailable.');
        }
        continue;
      }
      images.set(fact.fileEntryId, {
        type: 'file',
        mediaType: fact.mediaType,
        name: fact.name,
        uri,
      });
    } catch {
      if (signal.aborted) {
        throw signal.reason ?? new Error('Managed image resolution was aborted.');
      }
      if (resources.inputFiles.has(fact.fileEntryId)) {
        throw new Error('A current managed image could not be read.');
      }
    }
  }
  return images;
}

function imageAttachmentLimitMessage(limit: ImageAttachmentLimit): string {
  switch (limit) {
    case 'count':
      return 'Too many images are attached to this request.';
    case 'file-bytes':
      return 'An attached image exceeds the per-file size limit.';
    case 'total-bytes':
      return 'The attached images exceed the total request size limit.';
    case 'context':
      return 'The attached images exceed the selected model context budget.';
  }
}

function unsupportedAttachmentMessage(file: ManagedFileFact): string {
  return `Attachment ${JSON.stringify(file.name)} has unsupported media type ${JSON.stringify(file.mediaType)}.`;
}
