import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRootNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';

import { MarketplaceList } from '../components/MarketplaceList';
import { MarketplaceSection } from '../components/MarketplaceSection';
import {
  isSkillLink,
  type SkillDiscoverySource,
  useSettledQuery,
  useSkillDiscovery,
} from './useSkillDiscovery';

export const SKILL_SOURCE_TITLES = {
  cherryin: 'CherryIN',
  'skills-sh': 'skills.sh',
} as const satisfies Record<SkillDiscoverySource, string>;

/** Each source previews as a section; a pasted link resolves to its package on its own. */
export function MarketplaceSkills({
  browseHeader,
  query,
}: {
  browseHeader: ReactNode;
  query: string;
}) {
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useRootNavigationDockClearance();
  const search = useSettledQuery(query);
  const isSettling = query.trim() !== search;
  const isLink = isSkillLink(search);
  const discoveries = {
    cherryin: useSkillDiscovery('cherryin', search),
    'skills-sh': useSkillDiscovery('skills-sh', isLink ? '' : search),
  };

  if (isLink)
    return (
      <MarketplaceList
        empty={<SkillDiscoveryState discovery={discoveries.cherryin} isSettling={isSettling} />}
        entries={isSettling ? [] : discoveries.cherryin.entries}
        testID="marketplace-skills"
      />
    );

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 pt-2"
      contentContainerStyle={{ paddingBottom: bottom + dockClearance + 24 }}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      testID="marketplace-skills"
    >
      {browseHeader}
      {(Object.keys(SKILL_SOURCE_TITLES) as SkillDiscoverySource[]).map((source) => (
        <MarketplaceSection
          entries={isSettling ? [] : discoveries[source].entries}
          hasNextPage={!isSettling && discoveries[source].query.hasNextPage}
          key={source}
          onOpen={() =>
            router.push({
              pathname: '/skills/browse',
              params: { kind: 'skills', id: source, query: search },
            })
          }
          state={<SkillDiscoveryState discovery={discoveries[source]} isSettling={isSettling} />}
          testID={`marketplace-source-${source}`}
          title={SKILL_SOURCE_TITLES[source]}
        />
      ))}
    </ScrollView>
  );
}

/** Loading, failure or nothing found for one source. */
export function SkillDiscoveryState({
  discovery,
  isSettling = false,
}: {
  discovery: ReturnType<typeof useSkillDiscovery>;
  isSettling?: boolean;
}) {
  const { t } = useTranslation();
  const { hasQuery, query } = discovery;
  return query.isPending || isSettling ? (
    <ContentState.Loading title={t('skills.loading')} />
  ) : query.isError ? (
    <ContentState.Error
      title={t('skills.error.search-unavailable')}
      primaryAction={{ children: t('common.retry'), onPress: () => void query.refetch() }}
    />
  ) : (
    <ContentState.Empty
      icon={<EmptyIllustration scene={hasQuery ? 'search' : 'collection'} size="panel" />}
      title={t('skills.discover.empty')}
    />
  );
}
