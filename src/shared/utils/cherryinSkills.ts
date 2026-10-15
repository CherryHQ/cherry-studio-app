export const CHERRYIN_SKILLS_URL = 'https://skills.cherryin.ai';

/** An absent fragment opens a listing; a fragment identifies one package entry. */
export function cherryinSkillUrl(id: string, entryPath?: string): string {
  return `${CHERRYIN_SKILLS_URL}/?detail=${encodeURIComponent(id)}${entryPath === undefined ? '' : `#${encodeURIComponent(entryPath)}`}`;
}

export function cherryinSkillLocator(id: string, entryPath: string): string {
  return `cherryin:${encodeURIComponent(id)}/${entryPath}`;
}

export function parseCherryinSkillUrl(raw: string): { id: string; entryPath?: string } | null {
  try {
    const url = new URL(raw);
    if (url.origin !== CHERRYIN_SKILLS_URL || url.username || url.password) return null;
    const id = url.pathname === '/' ? url.searchParams.get('detail') : null;
    if (!id || id.length > 200) return null;
    const entryPath = url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined;
    if (
      entryPath !== undefined &&
      (entryPath.split('/').pop() !== 'SKILL.md' ||
        entryPath.split('/').some((part) => !part || part === '.' || part === '..') ||
        /[\\\u0000-\u001f]/.test(entryPath))
    )
      return null;
    return { id, entryPath };
  } catch {
    return null;
  }
}
