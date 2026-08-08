import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { withCherryMeta } from '@cherrystudio/universal/data/types/uiParts';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { imageMediaTypeFromExtension, isImageFileExtension } from '@/shared/utils/imageFileTypes';

export type ComposerAttachmentKind = 'file' | 'image';

export type ComposerAttachmentDraft = {
  fileEntryId?: string;
  id: string;
  kind: ComposerAttachmentKind;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
};

type PhotoAttachmentInput = {
  fileName?: string;
  id: string;
  uri: string;
};

const fallbackImageMediaType = 'image/*';
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
export const COMPOSER_PHOTO_SELECTION_LIMIT = 9;

export function createPhotoAttachmentDraft(photo: PhotoAttachmentInput): ComposerAttachmentDraft {
  const extension = photo.fileName?.trim().split('.').pop()?.toLowerCase();

  return {
    id: getPhotoAttachmentId(photo.id),
    kind: 'image',
    mediaType: imageMediaTypeFromExtension(extension),
    name: photo.fileName || fallbackImageName,
    uri: photo.uri,
  };
}

export function createPastedImageAttachmentDraft(uri: string): ComposerAttachmentDraft {
  const pathname = new URL(uri).pathname;
  const fileName = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));

  return createPhotoAttachmentDraft({ fileName, id: uri, uri });
}

type CameraPhotoInput = {
  uri: string;
};

export function createCameraAttachmentDraft(photo: CameraPhotoInput): ComposerAttachmentDraft {
  const uri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;

  return {
    id: getPhotoAttachmentId(uri),
    kind: 'image',
    mediaType: 'image/jpeg',
    name: fallbackImageName,
    uri,
  };
}

export function createDocumentAttachmentDraft(asset: DocumentPickerAsset): ComposerAttachmentDraft {
  const mediaType = asset.mimeType ?? fallbackFileMediaType;
  const isImage = isComposerImageMediaType(mediaType) || isComposerImageFileName(asset.name);

  return {
    id: getFileAttachmentId(asset.uri),
    kind: isImage ? 'image' : 'file',
    mediaType: isImage && mediaType === fallbackFileMediaType ? fallbackImageMediaType : mediaType,
    name: asset.name || fallbackFileName,
    size: asset.size,
    uri: asset.uri,
  };
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
    const filePart = {
      type: 'file',
      filename: attachment.name,
      mediaType: attachment.mediaType,
      url: attachment.uri,
    } as Extract<CherryMessagePart, { type: 'file' }>;
    parts.push(
      attachment.fileEntryId
        ? withCherryMeta(filePart, { fileEntryId: attachment.fileEntryId })
        : filePart,
    );
  }

  return parts;
}

export function hasComposerSendableContent(
  text: string,
  attachments: readonly ComposerAttachmentDraft[],
) {
  return text.trim().length > 0 || attachments.length > 0;
}
