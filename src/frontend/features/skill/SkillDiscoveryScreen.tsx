import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import {
  Button,
  Chip,
  ContentState,
  OptionPickerBottomSheet,
  Section,
} from '@cherrystudio/ui/components';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useBackendModule } from '@/frontend/data';
import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type { CherryinSkill, CherryinSkillQuery } from '@/shared/contracts/skillMarketplace';
import type { SkillListing } from '@/shared/contracts/skills';
import { cherryinSkillUrl, parseCherryinSkillUrl } from '@/shared/utils/cherryinSkills';

import {
  MARKETPLACE_DOMAINS,
  marketplaceText,
  type SkillDiscoverySource,
} from './discover/skillDiscovery';
import { SkillSourceFilter } from './discover/SkillSourceFilter';
import { SkillPage } from './SkillPage';

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

const sortLabelKeys = {
  popular: 'skills.discover.popular',
  newest: 'skills.marketplace.newest',
  name_asc: 'skills.marketplace.nameSort',
} as const;

export function SkillDiscoveryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { open: openSearch } = useAppSearch();
  const skills = useBackendModule('skills');
  const [source, setSource] = useState<SkillDiscoverySource>('cherryin');
  const [domain, setDomain] = useState('');
  const [sort, setSort] = useState<NonNullable<CherryinSkillQuery['sort']>>('popular');
  const [picker, setPicker] = useState<'source' | 'sort' | null>(null);
  const language = i18n.resolvedLanguage ?? i18n.language;

  const fromCherryin = (item: CherryinSkill): DiscoveryResult => ({
    name: marketplaceText(item.name, language),
    description: marketplaceText(item.description, language),
    url: cherryinSkillUrl(item.id),
    marketplaceId: item.id,
    installs: item.downloads,
    collection: item.tags.includes('collection'),
  });
  const catalog = useInfiniteQuery({
    queryKey: ['skills', 'cherryin', domain, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      skills.listCherryin({ domain, sort, offset: pageParam }, signal),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    enabled: source === 'cherryin',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const popular = useQuery({
    queryKey: ['skills', 'popular'],
    queryFn: ({ signal }) => skills.popular(signal),
    enabled: source === 'skills-sh',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const results =
    source === 'cherryin'
      ? [
          ...new Map<string, CherryinSkill>(
            catalog.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item]),
          ).values(),
        ].map(fromCherryin)
      : (popular.data ?? []).map(fromListing);
  const current = source === 'cherryin' ? catalog : popular;

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

  function search() {
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
                items: (popular.data ?? (await skills.popular(signal))).map(fromListing),
              },
            ],
          };
        const page = await skills.listCherryin(
          { domain, sort, offset: cursor ? Number(cursor) : 0 },
          signal,
        );
        return {
          groups: [{ key: 'cherryin', items: page.items.map(fromCherryin) }],
          nextCursor: page.nextOffset === null ? undefined : String(page.nextOffset),
        };
      },
      search: async ({ query, signal, cursor, filters }) => {
        if (/^https:\/\//i.test(query)) {
          const cherryin = parseCherryinSkillUrl(query);
          if (cherryin)
            return {
              groups: [
                {
                  key: 'url',
                  items: [fromCherryin(await skills.getCherryin(cherryin.id, signal))],
                },
              ],
            };
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
          { query, domain, sort, offset: cursor ? Number(cursor) : 0 },
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

  return (
    <SkillPage
      navigation="discover"
      headerProps={{
        title: t('skills.title'),
        rightActions: [
          {
            accessibilityLabel: t('skills.discover.search'),
            icon: SearchIcon,
            key: 'skill-discovery-search',
            onPress: search,
            type: 'icon',
          },
        ],
      }}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Button
          accessibilityLabel={t('skills.marketplace.source')}
          onPress={() => setPicker('source')}
          variant="ghost"
        >
          <Button.Label>{source === 'cherryin' ? 'CherryIN' : 'skills.sh'}</Button.Label>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
        {source === 'cherryin' ? (
          <Button onPress={() => setPicker('sort')} variant="ghost">
            <Button.Label>{t(sortLabelKeys[sort])}</Button.Label>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        ) : null}
      </View>
      {source === 'cherryin' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {['', ...MARKETPLACE_DOMAINS].map((item) => (
            <Chip.Selectable
              key={item}
              selected={domain === item}
              onSelectedChange={() => setDomain(item)}
            >
              {t(item ? `skills.marketplace.domain.${item}` : 'skills.marketplace.all')}
            </Chip.Selectable>
          ))}
        </ScrollView>
      ) : null}
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
              ? { children: 'skills.sh', onPress: () => setSource('skills-sh') }
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
        open={picker === 'source'}
        onClose={() => setPicker(null)}
        onValueChange={setSource}
        options={[
          { value: 'cherryin', label: 'CherryIN' },
          { value: 'skills-sh', label: 'skills.sh' },
        ]}
        selectedValue={source}
        size="compact"
        title={t('skills.marketplace.source')}
      />
      <OptionPickerBottomSheet
        open={picker === 'sort'}
        onClose={() => setPicker(null)}
        onValueChange={setSort}
        options={(Object.keys(sortLabelKeys) as (keyof typeof sortLabelKeys)[]).map((value) => ({
          value,
          label: t(sortLabelKeys[value]),
        }))}
        selectedValue={sort}
        size="compact"
        title={t('skills.marketplace.sort')}
      />
    </SkillPage>
  );
}
