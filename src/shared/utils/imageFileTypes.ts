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

/** Identify common raster media types from a file prefix, without decoding or validating pixels. */
export function imageMediaTypeFromHeader(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a)
    return 'image/png';
  if (bytes.length >= 3 && view.getUint16(0) === 0xffd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 6 &&
    view.getUint32(0) === 0x47494638 &&
    [0x3761, 0x3961].includes(view.getUint16(4))
  )
    return 'image/gif';
  if (bytes.length >= 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250)
    return 'image/webp';
  if (bytes.length >= 2 && view.getUint16(0) === 0x424d) return 'image/bmp';
  if (bytes.length >= 4 && [0x49492a00, 0x4d4d002a].includes(view.getUint32(0)))
    return 'image/tiff';
  if (bytes.length >= 12 && view.getUint32(4) === 0x66747970) {
    const brands = [view.getUint32(8)];
    const end = Math.min(view.getUint32(0), bytes.length);
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(view.getUint32(offset));
    if (brands.some((brand) => [0x61766966, 0x61766973].includes(brand))) return 'image/avif';
    if (brands.some((brand) => [0x68656963, 0x68656978, 0x68657663, 0x68657678].includes(brand)))
      return 'image/heic';
    if (brands.some((brand) => [0x6d696631, 0x6d736631].includes(brand))) return 'image/heif';
  }
  return undefined;
}

export function isAiSupportedImageMediaType(mediaType: string | null | undefined): boolean {
  return mediaType ? aiSupportedImageMediaTypes.has(mediaType.toLowerCase()) : false;
}

export function generatedImageExtension(mediaType: string): string {
  return imageFileTypeByMediaType.get(mediaType.toLowerCase())?.outputExtension ?? 'png';
}
