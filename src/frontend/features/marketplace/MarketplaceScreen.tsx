import { ActionMenu, Button, Tabs } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
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
  const openLibrary = () =>
    router.push({
      pathname: '/skills/library',
      params: {
        agentId: getSingleRouteParam(params.agentId),
        sessionId: getSingleRouteParam(params.sessionId),
      },
    });

  return (
    <>
      <RouteHeader
        title={t('marketplace.title')}
        rightActions={[
          {
            key: 'marketplace-library',
            type: 'custom',
            element: (
              <ActionMenu
                items={[
                  { id: 'skills', label: t('skills.library'), onPress: openLibrary },
                  {
                    id: 'agents',
                    label: t('marketplace.myAgents'),
                    onPress: () => router.push('/agents'),
                  },
                ]}
              >
                <Button size="sm" variant="ghost" testID="marketplace-library">
                  {t('marketplace.mine')}
                </Button>
              </ActionMenu>
            ),
          },
        ]}
      />
      <View className="flex-1 bg-background">
        <View className="px-4 pt-4 pb-3">
          <Tabs
            items={[
              { value: 'skills', label: t('skills.title'), testID: 'marketplace-tab-skills' },
              { value: 'agents', label: t('navigation.agents'), testID: 'marketplace-tab-agents' },
            ]}
            onValueChange={setTab}
            value={tab}
            variant="segmented"
          />
        </View>
        {tab === 'skills' ? (
          <MarketplaceSkills onOpenLibrary={openLibrary} />
        ) : (
          <AgentTemplateCatalog />
        )}
      </View>
    </>
  );
}
