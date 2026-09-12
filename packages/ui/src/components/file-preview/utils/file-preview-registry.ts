import type {
  FilePreviewComponent,
  FilePreviewKind,
  FilePreviewPlugin,
} from '../file-preview.types';

/**
 * Resolution is total. An unregistered kind falls back to the platform's
 * generic renderer, so classifying a file more precisely than any plugin
 * handles never costs a preview.
 */
export type FilePreviewRegistry = {
  resolve: (kind: FilePreviewKind) => FilePreviewComponent;
};

export function createFilePreviewRegistry(
  plugins: readonly FilePreviewPlugin[],
  fallback: FilePreviewComponent,
): FilePreviewRegistry {
  const byKind = indexPlugins(plugins);

  return { resolve: (kind) => byKind.get(kind) ?? fallback };
}

/**
 * Layered rather than merged: a nested registry overrides the kinds it names
 * and delegates everything else, including the fallback it never sees. That
 * keeps a local override — a compact row renderer, say — from having to restate
 * the defaults it does not care about.
 */
export function extendFilePreviewRegistry(
  base: FilePreviewRegistry,
  plugins: readonly FilePreviewPlugin[],
): FilePreviewRegistry {
  const byKind = indexPlugins(plugins);

  return { resolve: (kind) => byKind.get(kind) ?? base.resolve(kind) };
}

function indexPlugins(
  plugins: readonly FilePreviewPlugin[],
): Map<FilePreviewKind, FilePreviewComponent> {
  // Map construction keeps the last entry for a repeated kind, so a caller can
  // append an override to a list it received instead of filtering it first.
  return new Map(plugins.map((plugin) => [plugin.kind, plugin.component]));
}
