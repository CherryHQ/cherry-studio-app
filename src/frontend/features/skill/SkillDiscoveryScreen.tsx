import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAppSearch } from '@/frontend/appShell/search';
import { useBackendModule } from '@/frontend/data';
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
    </SkillPage>
  );
}
