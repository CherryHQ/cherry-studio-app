type HeaderStyle = { backgroundColor: string } | undefined;

export function getRootHeaderStyle(backgroundColor: string): HeaderStyle {
  return { backgroundColor };
}

export function getTransparentHeaderStyle(): HeaderStyle {
  return { backgroundColor: 'transparent' };
}
