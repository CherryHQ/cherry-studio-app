import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import { SkillsError } from '@/shared/contracts/skills';

import type { SkillAi } from './skillAi';
import type {
  createGithubSkillSource,
  SkillSourceAdapter,
  SkillSourceCandidate,
} from './skillSources';

const segment = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const skillsShSchema = z.object({
  skills: z.array(z.object({ id: z.string(), name: z.string(), source: z.string() })),
});
const claudeSchema = z.object({
  skills: z.array(
    z.object({
      name: z.string(),
      namespace: z.string(),
      sourceUrl: z.string().nullish(),
      description: z.string().nullish(),
      metadata: z
        .object({ repoOwner: segment, repoName: segment, directoryPath: z.string().nullish() })
        .nullish(),
    }),
  ),
});
const clawSchema = z.object({
  results: z.array(
    z.object({
      slug: segment.nullish(),
      displayName: z.string().nullish(),
      summary: z.string().nullish(),
      ownerHandle: segment.nullish(),
      owner: z.object({ handle: segment }).nullish(),
    }),
  ),
});

type Match = {
  title: string;
  content: string;
  url: string;
  resolve(signal?: AbortSignal): Promise<SkillSourceCandidate[]>;
};
export type SkillMarketplace = ReturnType<typeof createSkillMarketplace>;

/** Registry discovery and package identity are separate: several listings may resolve to one origin. */
export function createSkillMarketplace(
  github: ReturnType<typeof createGithubSkillSource>,
  clawhub: SkillSourceAdapter,
) {
  const skillsSh = createHttpClient({ baseUrl: 'https://skills.sh', timeoutMs: 15_000 });
  const claude = createHttpClient({ baseUrl: 'https://claude-plugins.dev', timeoutMs: 15_000 });
  const claw = createHttpClient({ baseUrl: 'https://clawhub.ai', timeoutMs: 15_000 });
  const annotate = (
    candidates: SkillSourceCandidate[],
    registry: 'skills.sh' | 'claude-plugins.dev' | 'clawhub.ai',
    url: string,
  ) =>
    candidates.map((candidate) => ({
      ...candidate,
      source: { ...candidate.source, discovery: { registry, url } },
    }));

  async function resolveUrl(raw: string, signal?: AbortSignal): Promise<SkillSourceCandidate[]> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new SkillsError('source-invalid', 'Provide a Skill page or GitHub URL.');
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
      return annotate(
        await github.resolveRepository(owner!, repo!, { name: kind }, signal),
        'skills.sh',
        raw,
      );
    }
    if (url.hostname === 'clawhub.ai' || url.hostname === 'www.clawhub.ai') {
      const slug =
        parts.length === 3 && repo === 'skills' ? kind : parts.length === 2 ? repo : null;
      if (!slug || !segment.safeParse(owner).success || !segment.safeParse(slug).success)
        throw new SkillsError('source-invalid', 'Provide a ClawHub publisher and Skill page.');
      return annotate(
        [await clawhub.resolve(`clawhub:${owner}/${slug}`, signal)],
        'clawhub.ai',
        raw,
      );
    }
    if (url.hostname === 'claude-plugins.dev' && parts[0] === 'skills' && parts[1]) {
      const response = await claude.request<unknown>({
        method: 'GET',
        path: '/api/skills',
        query: { q: parts.at(-1)!, limit: '20' },
        signal,
        maxResponseBytes: 512 * 1024,
      });
      const matches = fromClaude(response.data).filter(
        (match) => new URL(match.url).pathname === decodeURI(url.pathname),
      );
      if (matches.length !== 1)
        throw new SkillsError(
          'source-invalid',
          'This listing could not be resolved uniquely. Provide its GitHub source link.',
        );
      return matches[0]!.resolve(signal);
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

  function fromClaude(raw: unknown): Match[] {
    return claudeSchema.parse(raw).skills.flatMap((skill) => {
      const meta = skill.metadata;
      if (!meta) return [];
      let directory = meta.directoryPath?.replace(/^\/+|\/+$/g, '');
      let ref: string | undefined;
      if (skill.sourceUrl) {
        try {
          const source = new URL(skill.sourceUrl);
          const [owner, repo, kind, branch, ...path] = source.pathname
            .split('/')
            .filter(Boolean)
            .map(decodeURIComponent);
          if (
            source.protocol === 'https:' &&
            source.hostname === 'github.com' &&
            !source.username &&
            !source.password &&
            !source.port &&
            owner === meta.repoOwner &&
            repo === meta.repoName &&
            kind === 'tree' &&
            branch &&
            path.length
          ) {
            const resolvedDirectory = path.join('/');
            if (directory && directory !== resolvedDirectory) return [];
            directory = resolvedDirectory;
            ref = branch;
          }
        } catch {
          // Only explicit, valid metadata can substitute for a malformed source URL.
        }
      }
      if (!directory || directory.split('/').some((part) => !part || part === '..' || part === '.'))
        return [];
      const url = `https://claude-plugins.dev/skills/${skill.namespace}`;
      return [
        {
          title: skill.name,
          content: skill.description ?? '',
          url,
          resolve: async (signal) =>
            annotate(
              await github.resolveRepository(
                meta.repoOwner,
                meta.repoName,
                { directory, ref },
                signal,
              ),
              'claude-plugins.dev',
              url,
            ),
        },
      ];
    });
  }

  return {
    resolveUrl,
    async search(query: string, ai: SkillAi, signal?: AbortSignal) {
      const terms = await ai.planSearch(query, signal);
      const settled = await Promise.allSettled(
        terms.flatMap((term) => [
          skillsSh
            .request<unknown>({
              method: 'GET',
              path: '/api/search',
              query: { q: term, limit: '20' },
              signal,
              maxResponseBytes: 512 * 1024,
            })
            .then(({ data }): Match[] =>
              skillsShSchema.parse(data).skills.flatMap((skill) => {
                const [owner, repo, name] = skill.id.split('/');
                if (
                  !segment.safeParse(owner).success ||
                  !segment.safeParse(repo).success ||
                  !name ||
                  skill.source !== `${owner}/${repo}`
                )
                  return [];
                const url = `https://skills.sh/${skill.id}`;
                return [
                  {
                    title: skill.name,
                    content: skill.source,
                    url,
                    resolve: (abort) => resolveUrl(url, abort),
                  },
                ];
              }),
            ),
          claude
            .request<unknown>({
              method: 'GET',
              path: '/api/skills',
              query: { q: term, limit: '20' },
              signal,
              maxResponseBytes: 512 * 1024,
            })
            .then(({ data }) => fromClaude(data)),
          claw
            .request<unknown>({
              method: 'GET',
              path: '/api/v1/search',
              query: { q: term, limit: '20' },
              signal,
              maxResponseBytes: 512 * 1024,
            })
            .then(({ data }): Match[] =>
              clawSchema.parse(data).results.flatMap((skill) => {
                const owner = skill.ownerHandle ?? skill.owner?.handle;
                if (!owner || !skill.slug) return [];
                const url = `https://clawhub.ai/${owner}/skills/${skill.slug}`;
                return [
                  {
                    title: skill.displayName ?? skill.slug,
                    content: skill.summary ?? '',
                    url,
                    resolve: (abort) => resolveUrl(url, abort),
                  },
                ];
              }),
            ),
        ]),
      );
      signal?.throwIfAborted();
      let partial = settled.some((result) => result.status === 'rejected');
      if (settled.every((result) => result.status === 'rejected'))
        throw new SkillsError('search-unavailable', 'Skill registries could not be reached.');
      const matches = [
        ...new Map(
          settled
            .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
            .map((match) => [match.url, match]),
        ).values(),
      ].slice(0, 60);
      if (!matches.length) return { items: [], partial };
      const ranked = await ai.rankResults(
        query,
        matches.map(({ title, content, url }) => ({
          title: title.slice(0, 300),
          content: content.slice(0, 2000),
          url,
        })),
        signal,
      );
      const items: { candidate: SkillSourceCandidate; reason: string }[] = [];
      const seen = new Set<string>();
      for (const rank of ranked.slice(0, 8)) {
        if (items.length >= 20) break;
        const match = matches[rank.index];
        if (!match) continue;
        try {
          for (const candidate of await match.resolve(signal)) {
            if (items.length >= 20) break;
            const key = candidate.source.locator;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ candidate, reason: rank.reason });
          }
        } catch {
          signal?.throwIfAborted();
          partial = true;
        }
      }
      return { items, partial };
    },
  };
}
