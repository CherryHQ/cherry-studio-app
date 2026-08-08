import { isImageFileExtension } from '@/shared/utils/imageFileTypes';

import {
  type FilePreviewRegistration,
  resolveRegisteredPreview,
} from './filePreviewRegistry.types';

const registry = [
  { kind: 'image', matches: isImageFileExtension },
  { kind: 'quick-look', matches: () => true },
] as const satisfies readonly FilePreviewRegistration[];

export function resolveFilePreviewKind(extension: string | null) {
  return resolveRegisteredPreview(registry, extension);
}
