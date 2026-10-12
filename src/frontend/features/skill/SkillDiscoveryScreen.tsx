import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useBackendModule } from '@/frontend/data';
import { formatCompactNumber } from '@/frontend/utils/compactNumber';
import type { SkillListing } from '@/shared/contracts/skills';
import type { SkillCandidate } from '@/shared/data/types/skill';

import { SkillPage } from './SkillPage';

type DiscoveryResult = {
  key: string;
  name: string;
  description: string;
  url: string | null;
  candidate: SkillCandidate | null;
  installs?: number;
};

const fromCandidate = (candidate: SkillCandidate): DiscoveryResult => ({
  key: candidate.candidateId,
  name: candidate.name,
  description: candidate.description,
  url: null,
  candidate,
});

const fromListing = (listing: SkillListing): DiscoveryResult => ({
  key: listing.url,
  name: listing.name,
  description: listing.source,
  url: listing.url,
  candidate: null,
  installs: listing.installs,
});

export function SkillDiscoveryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { open: openSearch } = useAppSearch();
  const skillsModule = useBackendModule('skills');
  const popular = useQuery({
    queryFn: async ({ signal }) => (await skillsModule.popular(signal)).map(fromListing),
    queryKey: ['skills', 'popular'],
    retry: false,
    staleTime: 5 * 60_000,
  });
  const popularSkills = popular.data ?? [];

  function open(result: DiscoveryResult) {
    router.push({
      pathname: '/skills/candidate',
      params: {
        ...(result.candidate
          ? { candidateId: result.candidate.candidateId }
          : { url: result.url! }),
        name: result.name,
        description: result.description,
      },
    });
  }

  function searchSkills() {
    void openSearch<DiscoveryResult>({
      debounceMs: 300,
      emptyText: t('skills.discover.empty'),
      getAccessibilityLabel: (result) => result.name,
      keyExtractor: (result) => result.key,
      // Without a loaded list the empty query waits for input instead of reporting no matches.
      loadRecent: popularSkills.length
        ? () => ({ groups: [{ key: 'popular', items: popularSkills }] })
        : undefined,
      placeholder: t('skills.discover.query'),
      renderItem: (result) => (
        <View className="gap-0.5 py-3">
          <Text className="text-base text-foreground">{result.name}</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {result.description}
          </Text>
        </View>
      ),
      search: async ({ query, signal }) => {
        if (/^https:\/\//i.test(query)) {
          const candidates = await skillsModule.resolve(query, signal);
          return { groups: [{ key: 'source', items: candidates.map(fromCandidate) }] };
        }
        const listings = await skillsModule.search(query, signal);
        return { groups: [{ key: 'discovered', items: listings.map(fromListing) }] };
      },
    }).then((outcome) => {
      // Resolving and inspecting a selected listing belongs to its detail page.
      if (outcome.type === 'selected') open(outcome.item);
    });
  }

  return (
    <SkillPage
      headerProps={{
        title: t('skills.discover.title'),
        rightActions: [
          {
            accessibilityLabel: t('skills.discover.search'),
            icon: SearchIcon,
            key: 'skill-discovery-search',
            onPress: searchSkills,
            testID: 'skills-discover-search',
            type: 'icon',
          },
        ],
      }}
    >
      <Text className="text-sm text-muted-foreground">{t('skills.discover.hint')}</Text>
      {popular.isLoading ? (
        <View className="flex-1 justify-center">
          <ContentState.Loading title={t('skills.loading')} />
        </View>
      ) : popular.isError ? (
        <View className="flex-1 justify-center">
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void popular.refetch() }}
            title={t('skills.error.search-unavailable')}
          />
        </View>
      ) : popularSkills.length ? (
        <Section title={t('skills.discover.popular')}>
          {popularSkills.map((result) => (
            <Section.Item
              accessibilityLabel={`${result.name}, ${result.description}`}
              description={result.description}
              key={result.key}
              label={result.name}
              onPress={() => open(result)}
              testID={`skills-discover-${result.key}`}
              trailing={
                <View className="flex-row items-center gap-1">
                  {result.installs === undefined ? null : (
                    <Text className="text-sm text-muted-foreground">
                      {formatCompactNumber(result.installs)}
                    </Text>
                  )}
                  <ChevronRightIcon className="size-5 text-muted-foreground" />
                </View>
              }
            />
          ))}
        </Section>
      ) : null}
    </SkillPage>
  );
}
