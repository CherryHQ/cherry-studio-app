import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  Button,
  ContentState,
  OptionPickerBottomSheet,
  Section,
} from '@cherrystudio/ui/components';
import { queryOptions, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useBackendModule } from '@/frontend/data';
import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type { CherryinSkill } from '@/shared/contracts/skillMarketplace';
import type { SkillListing, SkillsModule } from '@/shared/contracts/skills';
import { cherryinSkillUrl, parseCherryinSkillUrl } from '@/shared/utils/cherryinSkills';

import { marketplaceText, type SkillDiscoverySource } from './discover/skillDiscovery';
import { SkillSourceFilter } from './discover/SkillSourceFilter';

type DiscoveryResult = {
  name: string;
  description: string;
  url: string;
  marketplaceId?: string;
  candidateId?: string;
  installs?: number;
  collection?: boolean;
};

const fromListing = (listing: SkillListing): DiscoveryResult => ({
  name: listing.name,
  description: listing.source,
  url: listing.url,
  installs: listing.installs,
});

const popularSkillsQuery = (skills: SkillsModule) =>
  queryOptions({
    queryKey: ['skills', 'popular'],
    queryFn: ({ signal }) => skills.popular(signal),
    retry: false,
    staleTime: 5 * 60_000,
  });

function useDiscoveryResult() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const language = i18n.resolvedLanguage ?? i18n.language;

  const fromCherryin = (item: CherryinSkill): DiscoveryResult => ({
    name: marketplaceText(item.name, language),
    description: marketplaceText(item.description, language),
    url: cherryinSkillUrl(item.id),
    marketplaceId: item.id,
    installs: item.downloads,
    collection: item.tags.includes('collection'),
  });

  function open(result: DiscoveryResult) {
    if (result.marketplaceId) {
      router.push({
        pathname: '/skills/marketplace/[marketplaceId]',
        params: { marketplaceId: result.marketplaceId },
      });
    } else {
      router.push({
        pathname: '/skills/candidate',
        params: {
          ...(result.candidateId ? { candidateId: result.candidateId } : { url: result.url }),
          name: result.name,
          description: result.description,
        },
      });
    }
  }

  return { fromCherryin, open };
}

export function useSkillDiscoverySearch(source: SkillDiscoverySource) {
  const { t } = useTranslation();
  const { open: openSearch } = useAppSearch();
  const queryClient = useQueryClient();
  const skills = useBackendModule('skills');
  const { fromCherryin, open } = useDiscoveryResult();

  return () =>
    void openSearch<DiscoveryResult, SkillDiscoverySource>({
      debounceMs: 300,
      filter: { component: SkillSourceFilter, context: undefined, initialValue: source },
      emptyText: t('skills.discover.empty'),
      getAccessibilityLabel: (item) => item.name,
      keyExtractor: (item) => item.url,
      placeholder: t('skills.marketplace.searchPlaceholder'),
      renderItem: (item) => (
        <View className="gap-0.5 py-3">
          <Text className="text-base text-foreground">{item.name}</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      ),
      loadRecent: async ({ filters, signal, cursor }) => {
        if (filters === 'skills-sh')
          return {
            groups: [
              {
                key: 'popular',
                items: (await queryClient.fetchQuery(popularSkillsQuery(skills))).map(fromListing),
              },
            ],
          };
        const page = await skills.listCherryin({ offset: cursor ? Number(cursor) : 0 }, signal);
        return {
          groups: [{ key: 'cherryin', items: page.items.map(fromCherryin) }],
          nextCursor: page.nextOffset === null ? undefined : String(page.nextOffset),
        };
      },
      search: async ({ query, signal, cursor, filters }) => {
        if (/^https:\/\//i.test(query)) {
          const cherryin = parseCherryinSkillUrl(query);
          if (cherryin) {
            const detail = await skills.getCherryin(cherryin.id, signal);
            return {
              groups: [
                {
                  key: 'url',
                  items: detail.mobileSupport === 'supported' ? [fromCherryin(detail)] : [],
                },
              ],
            };
          }
          const candidates = await skills.resolve(query, signal);
          return {
            groups: [
              {
                key: 'url',
                items: candidates.map((candidate) => ({
                  name: candidate.name,
                  description: candidate.description,
                  url: candidate.source.url!,
                  candidateId: candidate.candidateId,
                })),
              },
            ],
          };
        }
        if (filters === 'skills-sh')
          return {
            groups: [
              {
                key: 'skills-sh',
                items: (await skills.searchSkillsSh(query, signal)).map(fromListing),
              },
            ],
          };
        const page = await skills.listCherryin(
          { query, offset: cursor ? Number(cursor) : 0 },
          signal,
        );
        return {
          groups: [{ key: 'cherryin', items: page.items.map(fromCherryin) }],
          nextCursor: page.nextOffset === null ? undefined : String(page.nextOffset),
        };
      },
    }).then((outcome) => {
      if (outcome.type === 'selected') open(outcome.item);
    });
}

export function SkillDiscoveryTab({
  source,
  onSourceChange,
}: {
  source: SkillDiscoverySource;
  onSourceChange: (source: SkillDiscoverySource) => void;
}) {
  const { t } = useTranslation();
  const skills = useBackendModule('skills');
  const { fromCherryin, open } = useDiscoveryResult();
  const [isSourcePickerOpen, setSourcePickerOpen] = useState(false);

  const catalog = useInfiniteQuery({
    queryKey: ['skills', 'cherryin'],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => skills.listCherryin({ offset: pageParam }, signal),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: source === 'cherryin',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const popular = useQuery({ ...popularSkillsQuery(skills), enabled: source === 'skills-sh' });
  const results =
    source === 'cherryin'
      ? [
          ...new Map<string, CherryinSkill>(
            catalog.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
          ).values(),
        ].map(fromCherryin)
      : (popular.data ?? []).map(fromListing);
  const current = source === 'cherryin' ? catalog : popular;

  return (
    <>
      <View className="flex-row">
        <Button
          accessibilityLabel={t('skills.marketplace.source')}
          onPress={() => setSourcePickerOpen(true)}
          variant="ghost"
        >
          <Button.Label>{source === 'cherryin' ? 'CherryIN' : 'skills.sh'}</Button.Label>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </View>
      {current.isLoading ? (
        <ContentState.Loading title={t('skills.loading')} />
      ) : current.isError && !current.data ? (
        <ContentState.Error
          title={t('skills.error.search-unavailable')}
          primaryAction={{ children: t('common.retry'), onPress: () => void current.refetch() }}
        />
      ) : results.length ? (
        <Section>
          {results.map((item) => (
            <Section.Item
              key={item.url}
              label={item.name}
              onPress={() => open(item)}
              description={
                <View className="gap-1">
                  <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                    {item.description}
                  </Text>
                  {item.collection ? (
                    <Text className="text-xs text-muted-foreground">
                      {t('skills.marketplace.collection')}
                    </Text>
                  ) : null}
                </View>
              }
              trailing={
                <View className="flex-row items-center gap-1">
                  {item.installs === undefined ? null : (
                    <Text className="text-sm text-muted-foreground">
                      {formatCompactNumber(item.installs)}
                    </Text>
                  )}
                  <ChevronRightIcon className="size-5 text-muted-foreground" />
                </View>
              }
            />
          ))}
        </Section>
      ) : (
        <ContentState.Empty
          title={t('skills.discover.empty')}
          primaryAction={
            source === 'cherryin'
              ? { children: 'skills.sh', onPress: () => onSourceChange('skills-sh') }
              : undefined
          }
        />
      )}
      {source === 'cherryin' && catalog.hasNextPage ? (
        <Button
          disabled={catalog.isFetchingNextPage}
          onPress={() => void catalog.fetchNextPage()}
          variant="ghost"
        >
          {catalog.isFetchNextPageError ? t('common.retry') : t('skills.loadMore')}
        </Button>
      ) : null}
      <OptionPickerBottomSheet
        open={isSourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        onValueChange={onSourceChange}
        options={[
          { value: 'cherryin', label: 'CherryIN' },
          { value: 'skills-sh', label: 'skills.sh' },
        ]}
        selectedValue={source}
        size="compact"
        title={t('skills.marketplace.source')}
      />
    </>
  );
}
