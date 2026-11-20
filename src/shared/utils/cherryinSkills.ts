import type { MarketplaceText } from '@/shared/contracts/skillMarketplace';

export const CHERRYIN_SKILLS_GLOBAL_URL = 'https://skills.cherryin.ai';
export const CHERRYIN_SKILLS_CN_URL = 'https://skills.cherryin.com.cn';
export const CHERRYIN_SKILLS_URL = CHERRYIN_SKILLS_GLOBAL_URL;
export const CHERRYIN_SKILLS_ORIGINS = [
  CHERRYIN_SKILLS_GLOBAL_URL,
  CHERRYIN_SKILLS_CN_URL,
] as const;

export type CherryinSkillsOrigin = (typeof CHERRYIN_SKILLS_ORIGINS)[number];

/** Unknown egress retains the domestic Skill marketplace mirror. */
export function cherryinSkillsBaseUrl(region: 'CN' | 'GLOBAL' | null): CherryinSkillsOrigin {
  return region === 'GLOBAL' ? CHERRYIN_SKILLS_GLOBAL_URL : CHERRYIN_SKILLS_CN_URL;
}

export function marketplaceText(text: MarketplaceText, language: string): string {
  return language.toLowerCase().startsWith('zh') ? text.zh || text.en : text.en || text.zh || '';
}

/** An absent fragment opens a listing; a fragment identifies one package entry. */
export function cherryinSkillUrl(
  id: string,
  entryPath?: string,
  baseUrl: string = CHERRYIN_SKILLS_URL,
): string {
  return `${baseUrl}/?detail=${encodeURIComponent(id)}${entryPath === undefined ? '' : `#${encodeURIComponent(entryPath)}`}`;
}

/** All regional `sourceUrl` prefixes that identify installed members of a CherryIN listing. */
export function cherryinSkillSourcePrefixes(id: string): readonly string[] {
  return CHERRYIN_SKILLS_ORIGINS.map((origin) => `${cherryinSkillUrl(id, undefined, origin)}#`);
}

export function cherryinSkillLocator(id: string, entryPath: string): string {
  return `cherryin:${encodeURIComponent(id)}/${entryPath}`;
}

export function parseCherryinSkillUrl(raw: string): { id: string; entryPath?: string } | null {
  try {
    const url = new URL(raw);
    if (
      !(CHERRYIN_SKILLS_ORIGINS as readonly string[]).includes(url.origin) ||
      url.username ||
      url.password
    )
      return null;
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
