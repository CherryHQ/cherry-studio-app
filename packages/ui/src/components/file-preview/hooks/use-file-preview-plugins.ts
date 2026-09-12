import { createContext, use } from 'react';

import {
  defaultFilePreviewFallback,
  defaultFilePreviewPlugins,
} from '../default-plugins/default-plugins';
import {
  createFilePreviewRegistry,
  type FilePreviewRegistry,
} from '../utils/file-preview-registry';

/**
 * What a `FilePreview` resolves against with no provider above it, so the
 * plugin surface stays opt-in and a caller that never registers anything gets
 * the platform defaults.
 */
export const builtInFilePreviewRegistry = createFilePreviewRegistry(
  defaultFilePreviewPlugins,
  defaultFilePreviewFallback,
);

export const FilePreviewPluginsContext = createContext<FilePreviewRegistry | null>(null);

export function useFilePreviewPlugins(): FilePreviewRegistry {
  return use(FilePreviewPluginsContext) ?? builtInFilePreviewRegistry;
}
