/** Where a gallery template card sat on screen, in window points. */
export type PaintingTemplateOrigin = Readonly<{
  height: number;
  templateId: string;
  width: number;
  x: number;
  y: number;
}>;

let pendingOrigin: PaintingTemplateOrigin | undefined;

/**
 * The stage grows the card out of this rect and shrinks it back on dismissal.
 * It is screen geometry, not route state, so it travels beside the navigation.
 */
export function setPaintingTemplateOrigin(origin: PaintingTemplateOrigin | undefined) {
  pendingOrigin = origin;
}

export function takePaintingTemplateOrigin(templateId: string | undefined) {
  const origin = pendingOrigin;
  pendingOrigin = undefined;
  return origin && origin.templateId === templateId ? origin : undefined;
}
