export type FilePreviewRendererKind = 'fallback' | 'image' | 'quick-look';

export type FilePreviewRegistration = {
  kind: FilePreviewRendererKind;
  matches(extension: string | null): boolean;
};

export function resolveRegisteredPreview(
  registry: readonly FilePreviewRegistration[],
  extension: string | null,
): FilePreviewRendererKind {
  const normalizedExtension = extension?.toLowerCase() ?? null;
  return registry.find(({ matches }) => matches(normalizedExtension))?.kind ?? 'fallback';
}
