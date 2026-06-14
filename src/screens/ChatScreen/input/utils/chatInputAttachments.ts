import type { DocumentPickerAsset } from 'expo-document-picker';
import type { ImagePickerAsset } from 'expo-image-picker';

import type { CherryMessagePart } from '@/data/types/message';

export type ChatInputAttachmentKind = 'file' | 'image';

export type ChatInputAttachmentDraft = {
  id: string;
  kind: ChatInputAttachmentKind;
  mediaType: string;
  name: string;
  size?: number;
  uri: string;
};

type PhotoAttachmentInput = {
  id: string;
  uri: string;
};

const fallbackImageMediaType = 'image/*';
const fallbackFileMediaType = 'application/octet-stream';
const fallbackImageName = 'Image';
const fallbackFileName = 'File';
const imageFileExtensions = new Set(['avif', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);

export function isChatInputImageMediaType(mediaType: string | null | undefined) {
  return mediaType?.startsWith('image/') ?? false;
}

export function isChatInputImageFileName(name: string | null | undefined) {
  const extension = name?.trim().split('.').pop()?.toLowerCase();

  return extension ? imageFileExtensions.has(extension) : false;
}

export function getChatInputFileExtension(name: string) {
  const extension = name.trim().split('.').pop();

  if (!extension || extension === name) {
    return '';
  }

  return extension.slice(0, 5).toUpperCase();
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

export function createPhotoAttachmentDraft(photo: PhotoAttachmentInput): ChatInputAttachmentDraft {
  return {
    id: getPhotoAttachmentId(photo.id),
    kind: 'image',
    mediaType: fallbackImageMediaType,
    name: fallbackImageName,
    uri: photo.uri,
  };
}

export function createImagePickerAttachmentDraft(
  asset: ImagePickerAsset,
): ChatInputAttachmentDraft {
  const mediaType = asset.mimeType ?? fallbackImageMediaType;
  const idSource = asset.assetId ?? asset.uri;

  return {
    id: getPhotoAttachmentId(idSource),
    kind: 'image',
    mediaType,
    name: asset.fileName ?? fallbackImageName,
    size: asset.fileSize,
    uri: asset.uri,
  };
}

export function createDocumentAttachmentDraft(
  asset: DocumentPickerAsset,
): ChatInputAttachmentDraft {
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
  attachments: readonly ChatInputAttachmentDraft[],
): CherryMessagePart[] {
  const trimmedText = text.trim();
  const parts: CherryMessagePart[] = trimmedText
    ? ([{ type: 'text', text: trimmedText }] as CherryMessagePart[])
    : [];

  for (const attachment of attachments) {
    parts.push({
      type: 'file',
      filename: attachment.name,
      mediaType: attachment.mediaType,
      url: attachment.uri,
    } as CherryMessagePart);
  }

  return parts;
}

export function hasChatInputSendableContent(
  text: string,
  attachments: readonly ChatInputAttachmentDraft[],
) {
  return text.trim().length > 0 || attachments.length > 0;
}
