import { Button, ContentState, Spinner } from '@cherrystudio/ui/components';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type { CherryinSkill } from '@/shared/contracts/skillMarketplace';
import type { SkillListing } from '@/shared/contracts/skills';
import {
  cherryinSkillUrl,
  marketplaceText,
  parseCherryinSkillUrl,
} from '@/shared/utils/cherryinSkills';

import { MarketplaceFilter } from '../components/MarketplaceFilter';
import { MarketplaceList } from '../components/MarketplaceList';
import type { SkillDiscoverySource } from './skillDiscovery';

type DiscoveryResult = {
  name: string;
  description: string;
  url: string;
  marketplaceId?: string;
  candidateId?: string;
  installs?: number;
  collection?: boolean;
};

type DiscoveryPage = { items: DiscoveryResult[]; nextOffset: number | null };

const SEARCH_DEBOUNCE_MS = 300;

const fromListing = (listing: SkillListing): DiscoveryResult => ({
  name: listing.name,
  description: listing.source,
  url: listing.url,
  installs: listing.installs,
});

const singlePage = (items: DiscoveryResult[]): DiscoveryPage => ({ items, nextOffset: null });

/** Settles the typed query so remote search runs once per pause rather than per keystroke. */
function useSettledQuery(query: string) {
  const trimmed = query.trim();
  const [settled, setSettled] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);
  return trimmed ? settled : '';
}

/**
 * Browses and searches CherryIN or skills.sh in place. A pasted CherryIN, skills.sh or GitHub
 * link resolves to its package regardless of the selected source.
 */
export function MarketplaceSkills({ query }: { query: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const skills = useBackendModule('skills');
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [source, setSource] = useState<SkillDiscoverySource>('cherryin');
  const search = useSettledQuery(query);

  const fromCherryin = (item: CherryinSkill): DiscoveryResult => ({
    name: marketplaceText(item.name, language),
    description: marketplaceText(item.description, language),
    url: cherryinSkillUrl(item.id),
    marketplaceId: item.id,
    installs: item.downloads,
    collection: item.tags.includes('collection'),
  });

  const catalog = useInfiniteQuery({
    queryKey: ['skills', 'discover', source, search, language],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => loadPage(pageParam, signal),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    retry: false,
    staleTime: 5 * 60_000,
  });

  async function loadPage(offset: number, signal: AbortSignal): Promise<DiscoveryPage> {
    if (/^https:\/\//i.test(search)) {
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

  const results = [
    ...new Map(
      (catalog.data?.pages ?? []).flatMap((page) => page.items).map((item) => [item.url, item]),
    ).values(),
  ];
  const isSettling = query.trim() !== search;

  return (
    <View className="flex-1">
      <MarketplaceFilter
        accessibilityLabel={t('skills.marketplace.source')}
        items={[
          { value: 'cherryin', label: 'CherryIN', testID: 'marketplace-source-cherryin' },
          { value: 'skills-sh', label: 'skills.sh', testID: 'marketplace-source-skills-sh' },
        ]}
        onValueChange={setSource}
        testID="marketplace-skill-source"
        value={source}
      />
      <MarketplaceList
        data={results}
        empty={
          catalog.isPending || isSettling ? (
            <ContentState.Loading title={t('skills.loading')} />
          ) : catalog.isError ? (
            <ContentState.Error
              title={t('skills.error.search-unavailable')}
              primaryAction={{ children: t('common.retry'), onPress: () => void catalog.refetch() }}
            />
          ) : (
            <ContentState.Empty
              title={t('skills.discover.empty')}
              primaryAction={
                source === 'cherryin'
                  ? { children: 'skills.sh', onPress: () => setSource('skills-sh') }
                  : undefined
              }
            />
          )
        }
        footer={
          catalog.isFetchingNextPage ? (
            <View className="items-center py-6">
              <Spinner accessibilityLabel={t('skills.loading')} size="sm" />
            </View>
          ) : catalog.isFetchNextPageError ? (
            <View className="items-center py-4">
              <Button onPress={() => void catalog.fetchNextPage()} size="sm" variant="ghost">
                {t('common.retry')}
              </Button>
            </View>
          ) : null
        }
        onEndReached={() => {
          if (catalog.hasNextPage && !catalog.isFetching && !catalog.isFetchNextPageError)
            void catalog.fetchNextPage();
        }}
        renderRow={(item) => ({
          accessibilityLabel: item.name,
          description: item.description,
          key: item.url,
          metadata: [
            item.collection ? t('skills.marketplace.collection') : null,
            item.installs === undefined
              ? null
              : t('marketplace.skills.installs', { value: formatCompactNumber(item.installs) }),
          ]
            .filter(Boolean)
            .join(' · '),
          onPress: () => open(item),
          testID: `marketplace-skill-${item.marketplaceId ?? item.url}`,
          title: item.name,
        })}
        testID="marketplace-skills"
      />
    </View>
  );
}
