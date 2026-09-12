import { type ReactNode, useMemo } from 'react';

import type { FilePreviewPlugin } from '../file-preview.types';
import {
  FilePreviewPluginsContext,
  useFilePreviewPlugins,
} from '../hooks/use-file-preview-plugins';
import { extendFilePreviewRegistry } from '../utils/file-preview-registry';

/**
 * Registers renderers for the previews inside it. Nesting layers: an inner
 * provider overrides the kinds it names and inherits the rest.
 *
 * `plugins` is a dependency, so pass a stable reference — a module constant, or
 * a memoized list — rather than a fresh array literal per render.
 */
export function FilePreviewPluginProvider({
  children,
  plugins,
}: {
  children: ReactNode;
  plugins: readonly FilePreviewPlugin[];
}) {
  const inherited = useFilePreviewPlugins();
  const registry = useMemo(
    () => extendFilePreviewRegistry(inherited, plugins),
    [inherited, plugins],
  );

  return <FilePreviewPluginsContext value={registry}>{children}</FilePreviewPluginsContext>;
}
