import LibraryBigIcon from '@cherrystudio/app-icons/icons/library-big';
import { Tabs } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { InlineSearch } from '@/frontend/components/InlineSearch';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { MarketplaceSkills } from './skills/MarketplaceSkills';
import { AgentTemplateCatalog } from './templates/AgentTemplateCatalog';

type MarketTab = 'skills' | 'agents';

export function MarketplaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    sessionId?: string | string[];
  }>();
  const [tab, setTab] = useState<MarketTab>('skills');
  // Each catalog keeps its own query, so switching back finds the previous search intact.
  const [queries, setQueries] = useState<Record<MarketTab, string>>({ skills: '', agents: '' });

  // The library button follows the open catalog: one tap to what the user already has.
  const openLibrary = () =>
    tab === 'skills'
      ? router.push({
          pathname: '/skills/library',
          params: {
            agentId: getSingleRouteParam(params.agentId),
            sessionId: getSingleRouteParam(params.sessionId),
          },
        })
      : router.push('/agents');

  return (
    <>
      <RouteHeader
        title={t('marketplace.title')}
        rightActions={[
          {
            accessibilityLabel: t(tab === 'skills' ? 'skills.library' : 'marketplace.myAgents'),
            icon: LibraryBigIcon,
            key: 'marketplace-library',
            nativeIcon: require('@/assets/header-toolbar/library-big.png'),
            onPress: openLibrary,
            testID: 'marketplace-library',
            type: 'icon',
          },
        ]}
      />
      <InlineSearch
        onChangeText={(value) => setQueries((current) => ({ ...current, [tab]: value }))}
        placeholder={t(
          tab === 'skills'
            ? 'skills.marketplace.searchPlaceholder'
            : 'marketplace.templates.search',
        )}
        value={queries[tab]}
      />
      <View className="flex-1 bg-background">
        <View className="px-4 pt-2">
          <Tabs
            accessibilityLabel={t('marketplace.title')}
            items={[
              { value: 'skills', label: t('skills.title'), testID: 'marketplace-tab-skills' },
              { value: 'agents', label: t('navigation.agents'), testID: 'marketplace-tab-agents' },
            ]}
            onValueChange={setTab}
            value={tab}
          />
        </View>
        {tab === 'skills' ? (
          <MarketplaceSkills query={queries.skills} />
        ) : (
          <AgentTemplateCatalog query={queries.agents} />
        )}
      </View>
    </>
  );
}
