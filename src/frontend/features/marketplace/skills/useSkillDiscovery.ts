import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import type { CherryinSkill } from '@/shared/contracts/skillMarketplace';
import type { SkillListing } from '@/shared/contracts/skills';
import {
  cherryinSkillUrl,
  marketplaceText,
  parseCherryinSkillUrl,
} from '@/shared/utils/cherryinSkills';

import type { MarketplaceEntry } from '../components/MarketplaceRow';

export type SkillDiscoverySource = 'cherryin' | 'skills-sh';

type DiscoveryResult = {
  name: string;
  description: string;
  url: string;
  marketplaceId?: string;
  candidateId?: string;
};

type DiscoveryPage = { items: DiscoveryResult[]; nextOffset: number | null };

const SEARCH_DEBOUNCE_MS = 300;

const fromListing = (listing: SkillListing): DiscoveryResult => ({
  name: listing.name,
  description: listing.source,
  url: listing.url,
});

const singlePage = (items: DiscoveryResult[]): DiscoveryPage => ({ items, nextOffset: null });

export const isSkillLink = (query: string) => /^https:\/\//i.test(query);

/** Settles the typed query so remote search runs once per pause rather than per keystroke. */
export function useSettledQuery(query: string) {
  const trimmed = query.trim();
  const [settled, setSettled] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);
  return trimmed ? settled : '';
}

/**
 * One source's browse or search results as catalog entries. A CherryIN, skills.sh or GitHub link
 * resolves to its package whichever source is asked. CherryIN pages on demand.
 */
export function useSkillDiscovery(source: SkillDiscoverySource, search: string) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const skills = useBackendModule('skills');
  const language = i18n.resolvedLanguage ?? i18n.language;

  const fromCherryin = (item: CherryinSkill): DiscoveryResult => ({
    name: marketplaceText(item.name, language),
    description: marketplaceText(item.description, language),
    url: cherryinSkillUrl(item.id),
    marketplaceId: item.id,
  });

  async function loadPage(offset: number, signal: AbortSignal): Promise<DiscoveryPage> {
    if (isSkillLink(search)) {
      const cherryin = parseCherryinSkillUrl(search);
      if (cherryin)
        return singlePage([fromCherryin(await skills.getCherryin(cherryin.id, signal))]);
      const candidates = await skills.resolve(search, signal);
      return singlePage(
        candidates.map((candidate) => ({
          name: candidate.name,
          description: candidate.description,
          url: candidate.source.url!,
          candidateId: candidate.candidateId,
        })),
      );
    }
    if (source === 'skills-sh')
      return singlePage(
        (search ? await skills.searchSkillsSh(search, signal) : await skills.popular(signal)).map(
          fromListing,
        ),
      );
    const page = await skills.listCherryin({ query: search || undefined, offset }, signal);
    return { items: page.items.map(fromCherryin), nextOffset: page.nextOffset };
  }

  const query = useInfiniteQuery({
    queryKey: ['skills', 'discover', source, search, language],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => loadPage(pageParam, signal),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
    staleTime: 5 * 60_000,
  });

  function open(result: DiscoveryResult) {
    if (result.marketplaceId)
      router.push({
        pathname: '/skills/marketplace/[marketplaceId]',
        params: { marketplaceId: result.marketplaceId },
      });
    else
      router.push({
        pathname: '/skills/candidate',
        params: {
          ...(result.candidateId ? { candidateId: result.candidateId } : { url: result.url }),
          name: result.name,
          description: result.description,
        },
      });
  }

  const entries: MarketplaceEntry[] = [
    ...new Map(
      (query.data?.pages ?? []).flatMap((page) => page.items).map((item) => [item.url, item]),
    ).values(),
  ].map((item) => ({
    description: item.description,
    key: item.url,
    kind: 'skill',
    onPress: () => open(item),
    testID: `marketplace-skill-${item.marketplaceId ?? item.url}`,
    title: item.name,
  }));

  return { entries, hasQuery: search.trim().length > 0, query };
}
