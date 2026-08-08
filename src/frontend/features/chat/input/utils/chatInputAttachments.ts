import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { withCherryMeta } from '@cherrystudio/universal/data/types/uiParts';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { imageMediaTypeFromExtension, isImageFileExtension } from '@/shared/utils/imageFileTypes';

export type ChatInputAttachmentKind = 'file' | 'image';

export type ChatInputAttachmentSource = {
  id: string;
  kind: ChatInputAttachmentKind;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
};

export type ChatInputAttachmentImporting = ChatInputAttachmentSource & {
  status: 'importing';
};

export type ChatInputAttachmentReady = ChatInputAttachmentSource & {
  fileEntryId: FileEntryId;
  status: 'ready';
};

export type ChatInputAttachmentDraft = ChatInputAttachmentImporting | ChatInputAttachmentReady;

export type ChatInputInitialAttachment = ChatInputAttachmentSource | ChatInputAttachmentReady;

type PhotoAttachmentInput = {
  fileName?: string;
  id: string;
  uri: string;
};

const fallbackImageMediaType = 'image/*';
const fallbackFileMediaType = 'application/octet-stream';
const fallbackImageName = 'Image';
const fallbackFileName = 'File';

export function isChatInputImageMediaType(mediaType: string | null | undefined) {
  return mediaType?.startsWith('image/') ?? false;
}

export function isChatInputImageFileName(name: string | null | undefined) {
  const extension = name?.trim().split('.').pop()?.toLowerCase();

  return isImageFileExtension(extension);
}

export function appendChatInputAttachments(
  current: readonly ChatInputAttachmentDraft[],
  next: readonly ChatInputAttachmentDraft[],
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

export function removeChatInputAttachment(
  attachments: readonly ChatInputAttachmentDraft[],
  attachmentId: string,
) {
  return attachments.filter((attachment) => attachment.id !== attachmentId);
}

export function createPhotoAttachmentDraft(photo: PhotoAttachmentInput): ChatInputAttachmentSource {
  const extension = photo.fileName?.trim().split('.').pop()?.toLowerCase();

  return {
    id: getPhotoAttachmentId(photo.id),
    kind: 'image',
    mediaType: imageMediaTypeFromExtension(extension),
    name: photo.fileName || fallbackImageName,
    uri: photo.uri,
  };
}

export function createPastedImageAttachmentDraft(uri: string): ChatInputAttachmentSource {
  const pathname = new URL(uri).pathname;
  const fileName = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1));

  return createPhotoAttachmentDraft({ fileName, id: uri, uri });
}

type CameraPhotoInput = {
  uri: string;
};

export function createCameraAttachmentDraft(photo: CameraPhotoInput): ChatInputAttachmentSource {
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
): ChatInputAttachmentSource {
  const mediaType = asset.mimeType ?? fallbackFileMediaType;
  const isImage = isChatInputImageMediaType(mediaType) || isChatInputImageFileName(asset.name);

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

export function createChatInputMessageParts(
  text: string,
  attachments: readonly ChatInputAttachmentReady[],
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
    parts.push(withCherryMeta(filePart, { fileEntryId: attachment.fileEntryId }));
  }

  return parts;
}

export function isChatInputAttachmentReady(
  attachment: ChatInputAttachmentDraft | ChatInputInitialAttachment,
): attachment is ChatInputAttachmentReady {
  return 'status' in attachment && attachment.status === 'ready';
}

export function hasImportingChatInputAttachments(attachments: readonly ChatInputAttachmentDraft[]) {
  return attachments.some((attachment) => attachment.status === 'importing');
}

export function hasChatInputSendableContent(
  text: string,
  attachments: readonly ChatInputAttachmentDraft[],
) {
  return text.trim().length > 0 || attachments.length > 0;
}
