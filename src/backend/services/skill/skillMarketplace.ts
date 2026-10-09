import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import { SkillsError, type SkillListing } from '@/shared/contracts/skills';

import type { createGithubSkillSource, SkillSourceCandidate } from './skillSources';

const segment = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const skillsShSchema = z.object({
  skills: z.array(z.object({ id: z.string(), name: z.string(), source: z.string() })),
});
const SEARCH_LIMIT = 20;

export type SkillMarketplace = ReturnType<typeof createSkillMarketplace>;

/** skills.sh discovery over GitHub-hosted packages; listings resolve to GitHub package identity. */
export function createSkillMarketplace(github: ReturnType<typeof createGithubSkillSource>) {
  const skillsSh = createHttpClient({ baseUrl: 'https://skills.sh', timeoutMs: 15_000 });

  async function resolveUrl(raw: string, signal?: AbortSignal): Promise<SkillSourceCandidate[]> {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new SkillsError('source-invalid', 'Provide a skills.sh page or GitHub URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      throw new SkillsError('source-invalid', 'Only public HTTPS Skill pages are supported.');
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

  return {
    resolveUrl,
    async search(query: string, signal?: AbortSignal): Promise<SkillListing[]> {
      let data: unknown;
      try {
        ({ data } = await skillsSh.request<unknown>({
          method: 'GET',
          path: '/api/search',
          query: { q: query, limit: String(SEARCH_LIMIT) },
          signal,
          maxResponseBytes: 512 * 1024,
        }));
      } catch (error) {
        signal?.throwIfAborted();
        throw new SkillsError('search-unavailable', 'skills.sh could not be reached.', {
          cause: error,
        });
      }
      const parsed = skillsShSchema.safeParse(data);
      if (!parsed.success)
        throw new SkillsError('search-unavailable', 'skills.sh returned an unexpected response.');
      return parsed.data.skills.flatMap((skill) => {
        const [owner, repo, name] = skill.id.split('/');
        if (
          !segment.safeParse(owner).success ||
          !segment.safeParse(repo).success ||
          !name ||
          skill.source !== `${owner}/${repo}`
        )
          return [];
        return [{ name: skill.name, source: skill.source, url: `https://skills.sh/${skill.id}` }];
      });
    },
  };
}
