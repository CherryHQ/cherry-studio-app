import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useBackendModule } from '@/frontend/data';
import { useRecommendedSkills } from '@/frontend/hooks/skill';
import type { SkillCandidate } from '@/shared/data/types/skill';

import { SkillPage } from './SkillPage';

type DiscoveryResult = {
  key: string;
  name: string;
  description: string;
  url: string | null;
  candidate: SkillCandidate | null;
};

const fromCandidate = (candidate: SkillCandidate): DiscoveryResult => ({
  key: candidate.candidateId,
  name: candidate.name,
  description: candidate.description,
  url: null,
  candidate,
});

export function SkillDiscoveryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { open: openSearch } = useAppSearch();
  const skillsModule = useBackendModule('skills');
  const recommended = useRecommendedSkills();

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
      loadRecent: async ({ signal }) => {
        const candidates = recommended.data ?? (await skillsModule.listRecommended());
        signal.throwIfAborted();
        return {
          groups: [
            {
              key: 'recommended',
              title: t('skills.recommended.title'),
              items: candidates.map(fromCandidate),
            },
          ],
        };
      },
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
        return {
          groups: [
            {
              key: 'discovered',
              items: listings.map((listing) => ({
                key: listing.url,
                name: listing.name,
                description: listing.source,
                url: listing.url,
                candidate: null,
              })),
            },
          ],
        };
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
      {recommended.isLoading ? <ContentState.Loading title={t('skills.loading')} /> : null}
      {recommended.isError ? (
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void recommended.refetch() }}
          title={t('skills.loadFailed')}
        />
      ) : null}
      {recommended.data ? (
        <Section title={t('skills.recommended.title')}>
          {recommended.data.map((candidate) => (
            <Section.Item
              accessibilityLabel={candidate.name}
              description={
                <View className="gap-0.5">
                  <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                    {candidate.description}
                  </Text>
                  {candidate.installedSkillId ? (
                    <Text className="text-xs text-success">
                      {t('skills.recommended.installed')}
                    </Text>
                  ) : null}
                </View>
              }
              key={candidate.candidateId}
              label={candidate.name}
              onPress={() => open(fromCandidate(candidate))}
              testID={`skill-candidate-${candidate.name}`}
              trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
            />
          ))}
        </Section>
      ) : null}
    </SkillPage>
  );
}
