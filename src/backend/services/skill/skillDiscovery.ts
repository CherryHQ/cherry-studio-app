import { SkillsError } from '@/shared/contracts/skills';
import type { WebSearchResponse } from '@/shared/data/types/webSearch';

import type { SkillAi } from './skillAi';
import { parseGithubSkillUrl } from './skillSources';

export type SkillWebSearch = (
  keywords: string[],
  signal?: AbortSignal,
) => Promise<WebSearchResponse>;

/** AI ranks observed URLs only; GitHub resolution subsequently proves each candidate exists. */
export async function discoverSkillUrls(
  ai: SkillAi,
  search: SkillWebSearch,
  query: string,
  signal?: AbortSignal,
) {
  if (!query.trim() || query.length > 2000)
    throw new SkillsError('source-invalid', 'Enter a task of at most 2000 characters.');
  const terms = await ai.planSearch(query, signal);
  let response: WebSearchResponse;
  try {
    response = await search(
      terms.map((term) => `${term} site:github.com "SKILL.md"`),
      signal,
    );
  } catch (error) {
    signal?.throwIfAborted();
    throw new SkillsError('search-unavailable', 'Skill search is unavailable.', { cause: error });
  }
  signal?.throwIfAborted();
  if (response.results.length === 0 && response.failures?.length) {
    throw new SkillsError('search-unavailable', 'Skill search returned only failed requests.');
  }
  const seen = new Set<string>();
  const results = response.results
    .filter(({ url }) => {
      if (seen.has(url) || !parseGithubSkillUrl(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 20)
    .map(({ title, content, url }) => ({
      title: title.slice(0, 300),
      content: content.slice(0, 2000),
      url,
    }));
  if (!results.length) return { matches: [], partial: Boolean(response.failures?.length) };
  const ranked = await ai.rankResults(query, results, signal);
  const indexes = new Set<number>();
  const matches = ranked.flatMap(({ index, reason }) => {
    if (indexes.has(index) || !results[index]) return [];
    indexes.add(index);
    return [{ url: results[index]!.url, reason }];
  });
  return { matches, partial: Boolean(response.failures?.length) };
}
