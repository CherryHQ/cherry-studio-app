export function htmlNavigationAction(
  url: string,
  isTopFrame = true,
): 'allow' | 'block' | 'external' {
  if (url === 'about:blank' || url.startsWith('about:blank#')) return 'allow';
  try {
    const { protocol } = new URL(url);
    if (isTopFrame && (protocol === 'http:' || protocol === 'https:')) return 'external';
  } catch {
    // Malformed and relative destinations do not leave the viewer.
  }
  return 'block';
}
