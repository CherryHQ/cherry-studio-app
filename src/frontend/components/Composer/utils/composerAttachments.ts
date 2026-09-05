import type { DocumentPickerAsset } from 'expo-document-picker';

import { type FileEntryId, fileEntryUrl } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { withCherryMeta } from '@/shared/data/types/uiParts';
import {
  AI_IMAGE_INPUT_MAX_COUNT,
  imageMediaTypeFromExtension,
  isAiSupportedImageMediaType,
  isImageFileExtension,
} from '@/shared/utils/imageFileTypes';

export type ComposerAttachmentKind = 'file' | 'image';

type ComposerAttachmentBase = {
  id: string;
  kind: ComposerAttachmentKind;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
};

export type ComposerAttachmentSource = ComposerAttachmentBase & {
  fileEntryId?: never;
  status?: never;
};

export type ComposerAttachmentImporting = ComposerAttachmentBase & {
  fileEntryId?: never;
  status: 'importing';
};

export type ComposerAttachmentReady = ComposerAttachmentBase & {
  fileEntryId: FileEntryId;
  status: 'ready';
};

export type ComposerAttachmentDraft =
  | ComposerAttachmentSource
  | ComposerAttachmentImporting
  | ComposerAttachmentReady;

export type ComposerInitialAttachment = ComposerAttachmentSource | ComposerAttachmentReady;

type PhotoAttachmentInput = {
  fileName?: string;
  id: string;
  uri: string;
};

const fallbackFileMediaType = 'application/octet-stream';
const fallbackImageName = 'Image';
const fallbackFileName = 'File';

export function isComposerImageMediaType(mediaType: string | null | undefined) {
  return mediaType?.startsWith('image/') ?? false;
}

export function isComposerImageFileName(name: string | null | undefined) {
  const extension = name?.trim().split('.').pop()?.toLowerCase();

  return isImageFileExtension(extension);
}

export function appendComposerAttachments(
  current: readonly ComposerAttachmentDraft[],
  next: readonly ComposerAttachmentDraft[],
) {
  const seenIds = new Set(current.map((attachment) => attachment.id));
  const additions = next.filter((attachment) => {
    if (seenIds.has(attachment.id)) {
      return false;
    }

    seenIds.add(attachment.id);
    return true;
  });

  return [...current, ...additions];
}

export function removeComposerAttachment(
  attachments: readonly ComposerAttachmentDraft[],
  attachmentId: string,
) {
  return attachments.filter((attachment) => attachment.id !== attachmentId);
}

// What the system photo picker is capped at. Chat and the drawing list share it
// so a batch that is valid in one is valid in the other.
export const COMPOSER_PHOTO_SELECTION_LIMIT = AI_IMAGE_INPUT_MAX_COUNT;

export function createPhotoAttachmentDraft(photo: PhotoAttachmentInput): ComposerAttachmentSource {
  const extension = photo.fileName?.trim().split('.').pop()?.toLowerCase();

  return {
    id: getPhotoAttachmentId(photo.id),
    kind: 'image',
    mediaType: imageMediaTypeFromExtension(extension),
    name: photo.fileName || fallbackImageName,
    uri: photo.uri,
  };
}

export function createPastedImageAttachmentDraft(uri: string): ComposerAttachmentSource {
  const pathname = new URL(uri).pathname;
  const fileName = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));

  return createPhotoAttachmentDraft({ fileName, id: uri, uri });
}

type CameraPhotoInput = {
  uri: string;
};

export function createCameraAttachmentDraft(photo: CameraPhotoInput): ComposerAttachmentSource {
  const uri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;

  return {
    id: getPhotoAttachmentId(uri),
    kind: 'image',
    mediaType: 'image/jpeg',
    name: fallbackImageName,
    uri,
  };
}

export function createDocumentAttachmentDraft(
  asset: DocumentPickerAsset,
): ComposerAttachmentSource {
  const mediaType = asset.mimeType ?? fallbackFileMediaType;
  const isImage = isComposerImageMediaType(mediaType) || isComposerImageFileName(asset.name);
  const extension = asset.name.trim().split('.').pop()?.toLowerCase();
  const resolvedMediaType =
    isImage && mediaType === fallbackFileMediaType
      ? imageMediaTypeFromExtension(extension)
      : mediaType;

  return {
    id: getFileAttachmentId(asset.uri),
    kind: isImage ? 'image' : 'file',
    mediaType: resolvedMediaType,
    name: asset.name || fallbackFileName,
    size: asset.size,
    uri: asset.uri,
  };
}

export function isComposerAttachmentSupported(attachment: ComposerAttachmentDraft): boolean {
  return attachment.kind !== 'image' || isAiSupportedImageMediaType(attachment.mediaType);
}

export function getPhotoAttachmentId(photoId: string) {
  return `photo:${photoId}`;
}

export function getFileAttachmentId(uri: string) {
  return `file:${uri}`;
}

export function createComposerMessageParts(
  text: string,
  attachments: readonly ComposerAttachmentDraft[],
): CherryMessagePart[] {
  const trimmedText = text.trim();
  const parts: CherryMessagePart[] = trimmedText
    ? ([{ type: 'text', text: trimmedText }] as CherryMessagePart[])
    : [];

  for (const attachment of attachments) {
    // Imported attachments persist the entry-id sentinel URL, never a sandbox
    // path; un-imported ones keep their transient picker URI for send-time import.
    const filePart = {
      type: 'file',
      filename: attachment.name,
      mediaType: attachment.mediaType,
      url: isComposerAttachmentReady(attachment)
        ? fileEntryUrl(attachment.fileEntryId)
        : attachment.uri,
    } as Extract<CherryMessagePart, { type: 'file' }>;
    parts.push(
      isComposerAttachmentReady(attachment)
        ? withCherryMeta(filePart, { fileEntryId: attachment.fileEntryId })
        : filePart,
    );
  }

  return parts;
}

export function isComposerAttachmentReady(
  attachment: ComposerAttachmentDraft | ComposerInitialAttachment,
): attachment is ComposerAttachmentReady {
  return attachment.status === 'ready';
}

export function hasImportingComposerAttachments(attachments: readonly ComposerAttachmentDraft[]) {
  return attachments.some((attachment) => attachment.status === 'importing');
}

export function hasComposerSendableContent(
  text: string,
  attachments: readonly ComposerAttachmentDraft[],
) {
  return text.trim().length > 0 || attachments.length > 0;
}
