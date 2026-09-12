const CITATION_LINK_PREFIX = 'cite:';

export function createCitationLinkUrl(url: string): string {
  return `${CITATION_LINK_PREFIX}${encodeURIComponent(url)}`;
}

export function resolveCitationLinkUrl(url: string): string | undefined {
  if (!url.startsWith(CITATION_LINK_PREFIX)) return undefined;

  try {
    return decodeURIComponent(url.slice(CITATION_LINK_PREFIX.length));
  } catch {
    return undefined;
  }
}
