type HeaderStyle = { backgroundColor: string } | undefined;

export function getRootHeaderStyle(_backgroundColor: string): HeaderStyle {
  return undefined;
}

export function getTransparentHeaderStyle(): HeaderStyle {
  return undefined;
}
