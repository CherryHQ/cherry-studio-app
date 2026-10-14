import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import type { CherryinSkillQuery } from '@/shared/contracts/skillMarketplace';
import { SkillsError, type SkillListing } from '@/shared/contracts/skills';
import { cherryinSkillUrl, parseCherryinSkillUrl } from '@/shared/utils/cherryinSkills';

import type { CherryinSkillClient } from './cherryinSkillClient';
import type { createCherryinSkillSource } from './cherryinSkillSource';
import type { createGithubSkillSource, SkillSourceCandidate } from './skillSources';

const segment = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const listingsSchema = z.object({
  skills: z.array(
    z.object({
      source: z.string(),
      skillId: z.string(),
      name: z.string(),
      installs: z.number().optional().catch(undefined),
    }),
  ),
});
const SEARCH_LIMIT = 20;
const POPULAR_LIMIT = 50;

export type SkillMarketplace = ReturnType<typeof createSkillMarketplace>;

/** Catalog-only discovery, with acquisition delegated to each package source. */
export function createSkillMarketplace(
  github: ReturnType<typeof createGithubSkillSource>,
  cherryin?: { client: CherryinSkillClient; source: ReturnType<typeof createCherryinSkillSource> },
) {
  const skillsSh = createHttpClient({ baseUrl: 'https://skills.sh', timeoutMs: 15_000 });

  async function resolveUrl(raw: string, signal?: AbortSignal): Promise<SkillSourceCandidate[]> {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new SkillsError('source-invalid', 'Provide a CherryIN, skills.sh, or GitHub URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      throw new SkillsError('source-invalid', 'Only public HTTPS Skill pages are supported.');
    if (parseCherryinSkillUrl(raw)) {
      if (!cherryin) throw new SkillsError('source-invalid', 'CherryIN is unavailable.');
      return cherryin.source.resolveUrl(raw, signal);
    }
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [owner, repo, kind, ref, ...rest] = parts;
    if (
      (url.hostname === 'skills.sh' || url.hostname === 'www.skills.sh') &&
      parts.length === 3 &&
      segment.safeParse(owner).success &&
      segment.safeParse(repo).success
    ) {
      return github.resolveRepository(owner!, repo!, { name: kind }, signal);
    }
    if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
      return [
        await github.resolveUrl(
          `https://github.com/${owner}/${repo}/blob/${parts.slice(2).map(encodeURIComponent).join('/')}`,
          signal,
        ),
      ];
    }
    if (url.hostname !== 'github.com' || !owner || !repo)
      throw new SkillsError('source-invalid', 'This Skill source is not supported.');
    if (parts.length === 2)
      return github.resolveRepository(owner, repo.replace(/\.git$/, ''), {}, signal);
    if (kind === 'blob' && url.pathname.endsWith('/SKILL.md'))
      return [await github.resolveUrl(url.origin + url.pathname, signal)];
    if (kind === 'tree' && ref)
      return github.resolveRepository(owner, repo, { ref, directory: rest.join('/') }, signal);
    throw new SkillsError(
      'source-invalid',
      'Provide a GitHub repository, Skill directory, or SKILL.md link.',
    );
  }

  async function listings(
    request: { path: string; query?: Record<string, string> },
    signal?: AbortSignal,
  ): Promise<SkillListing[]> {
    let data: unknown;
    try {
      ({ data } = await skillsSh.request<unknown>({
        method: 'GET',
        ...request,
        signal,
        maxResponseBytes: 512 * 1024,
      }));
    } catch (error) {
      signal?.throwIfAborted();
      throw new SkillsError('search-unavailable', 'skills.sh could not be reached.', {
        cause: error,
      });
    }
    const parsed = listingsSchema.safeParse(data);
    if (!parsed.success)
      throw new SkillsError('search-unavailable', 'skills.sh returned an unexpected response.');
    return parsed.data.skills.flatMap(({ source, skillId, name, installs }) => {
      const [owner, repo, ...rest] = source.split('/');
      // skills.sh also lists other publishers; only `<owner>/<repo>` sources resolve to packages.
      if (
        rest.length > 0 ||
        !segment.safeParse(owner).success ||
        !segment.safeParse(repo).success ||
        !skillId ||
        skillId.includes('/')
      )
        return [];
      return [{ name, source, url: `https://skills.sh/${source}/${skillId}`, installs }];
    });
  }

  return {
    resolveUrl,
    searchSkillsSh: (query: string, signal?: AbortSignal) =>
      listings({ path: '/api/search', query: { q: query, limit: String(SEARCH_LIMIT) } }, signal),
    async search(query: string, signal?: AbortSignal): Promise<SkillListing[]> {
      if (cherryin) {
        const page = await cherryin.client.list({ query }, signal);
        if (page.items.length)
          return page.items.map((skill) => ({
            name: skill.name.en || skill.name.zh || skill.id,
            source: `CherryIN · ${skill.author}`,
            url: cherryinSkillUrl(skill.id),
            installs: skill.downloads,
          }));
      }
      return listings(
        { path: '/api/search', query: { q: query, limit: String(SEARCH_LIMIT) } },
        signal,
      );
    },
    listCherryin(input: CherryinSkillQuery, signal?: AbortSignal) {
      if (!cherryin) throw new SkillsError('source-unreachable', 'CherryIN is unavailable.');
      return cherryin.client.list(input, signal);
    },
    getCherryin(id: string, signal?: AbortSignal) {
      if (!cherryin) throw new SkillsError('source-unreachable', 'CherryIN is unavailable.');
      return cherryin.client.detail(id, signal);
    },
    /** The registry's all-time most installed Skills, most installed first. */
    async popular(signal?: AbortSignal): Promise<SkillListing[]> {
      return (await listings({ path: '/api/skills/all-time/0' }, signal)).slice(0, POPULAR_LIMIT);
    },
  };
}
