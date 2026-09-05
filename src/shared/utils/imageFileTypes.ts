const imageFileTypes = [
  { extensions: ['avif'], mediaType: 'image/avif', outputExtension: 'avif' },
  { extensions: ['gif'], mediaType: 'image/gif', outputExtension: 'gif' },
  { extensions: ['heic'], mediaType: 'image/heic', outputExtension: 'heic' },
  { extensions: ['heif'], mediaType: 'image/heif', outputExtension: 'heif' },
  { extensions: ['jpeg', 'jpg'], mediaType: 'image/jpeg', outputExtension: 'jpg' },
  { extensions: ['png'], mediaType: 'image/png', outputExtension: 'png' },
  { extensions: ['webp'], mediaType: 'image/webp', outputExtension: 'webp' },
] as const;

export const AI_SUPPORTED_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Shared picker and Agent Host ceiling for one model request. */
export const AI_IMAGE_INPUT_MAX_COUNT = 9;

type ImageFileType = (typeof imageFileTypes)[number];

const imageFileTypeByExtension = new Map<string, ImageFileType>(
  imageFileTypes.flatMap((fileType) =>
    fileType.extensions.map((extension) => [extension, fileType] as const),
  ),
);
const imageFileTypeByMediaType = new Map<string, ImageFileType>(
  imageFileTypes.map((fileType) => [fileType.mediaType, fileType] as const),
);
const aiSupportedImageMediaTypes = new Set<string>(AI_SUPPORTED_IMAGE_MEDIA_TYPES);

export function isImageFileExtension(extension: string | null | undefined): boolean {
  return extension ? imageFileTypeByExtension.has(extension.toLowerCase()) : false;
}

export function imageMediaTypeFromExtension(extension: string | null | undefined): string {
  return extension
    ? (imageFileTypeByExtension.get(extension.toLowerCase())?.mediaType ?? 'image/*')
    : 'image/*';
}

export function isAiSupportedImageMediaType(mediaType: string | null | undefined): boolean {
  return mediaType ? aiSupportedImageMediaTypes.has(mediaType.toLowerCase()) : false;
}

export function generatedImageExtension(mediaType: string): string {
  return imageFileTypeByMediaType.get(mediaType.toLowerCase())?.outputExtension ?? 'png';
}
