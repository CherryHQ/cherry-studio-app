export const OFFICE_LINK_LIMIT = 4096;

export function officeLinkTarget(
  raw: string,
): { kind: 'external' | 'bookmark'; value: string } | null {
  if (!raw || raw.length > OFFICE_LINK_LIMIT || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('#')) {
    try {
      const value = decodeURIComponent(raw.slice(1));
      return value ? { kind: 'bookmark', value } : null;
    } catch {
      return null;
    }
  }
  if (!/^(https?:\/\/|mailto:)/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || (url.protocol === 'mailto:' && !url.pathname)) return null;
    return { kind: 'external', value: url.href };
  } catch {
    return null;
  }
}
