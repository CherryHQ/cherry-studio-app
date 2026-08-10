const imageFileTypes = [
  { extensions: ['avif'], mediaType: 'image/avif', outputExtension: 'avif' },
  { extensions: ['gif'], mediaType: 'image/gif', outputExtension: 'gif' },
  { extensions: ['heic'], mediaType: 'image/heic', outputExtension: 'heic' },
  { extensions: ['heif'], mediaType: 'image/heif', outputExtension: 'heif' },
  { extensions: ['jpeg', 'jpg'], mediaType: 'image/jpeg', outputExtension: 'jpg' },
  { extensions: ['png'], mediaType: 'image/png', outputExtension: 'png' },
  { extensions: ['webp'], mediaType: 'image/webp', outputExtension: 'webp' },
] as const;

type ImageFileType = (typeof imageFileTypes)[number];

const imageFileTypeByExtension = new Map<string, ImageFileType>(
  imageFileTypes.flatMap((fileType) =>
    fileType.extensions.map((extension) => [extension, fileType] as const),
  ),
);
const imageFileTypeByMediaType = new Map<string, ImageFileType>(
  imageFileTypes.map((fileType) => [fileType.mediaType, fileType] as const),
);

export function isImageFileExtension(extension: string | null | undefined): boolean {
  return extension ? imageFileTypeByExtension.has(extension.toLowerCase()) : false;
}

export function imageMediaTypeFromExtension(extension: string | null | undefined): string {
  return extension
    ? (imageFileTypeByExtension.get(extension.toLowerCase())?.mediaType ?? 'image/*')
    : 'image/*';
}

export function generatedImageExtension(mediaType: string): string {
  return imageFileTypeByMediaType.get(mediaType.toLowerCase())?.outputExtension ?? 'png';
}
