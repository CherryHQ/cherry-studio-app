type HeaderStyle = { backgroundColor: string } | undefined;

export const paintingViewerHeaderShown = false;

export function getRootHeaderStyle(_backgroundColor: string): HeaderStyle {
  return undefined;
}

export function getTransparentHeaderStyle(): HeaderStyle {
  return undefined;
}
