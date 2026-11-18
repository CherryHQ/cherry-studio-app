import LibraryBigIcon from '@cherrystudio/app-icons/icons/library-big';
import { ActionMenu, Button, Tabs } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

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
                <Button
                  accessibilityLabel={t('marketplace.mine')}
                  icon={<LibraryBigIcon className="size-5 text-foreground" />}
                  variant="ghost"
                  testID="marketplace-library"
                />
              </ActionMenu>
            ),
          },
        ]}
      />
      <View className="flex-1 bg-background">
        <View className="px-5 pt-1">
          <Tabs
            items={[
              {
                value: 'skills',
                label: t('skills.title'),
                testID: 'marketplace-tab-skills',
                children: (
                  <Text
                    className={
                      tab === 'skills'
                        ? 'font-semibold text-xl text-foreground'
                        : 'font-semibold text-xl text-muted-foreground'
                    }
                  >
                    {t('skills.title')}
                  </Text>
                ),
              },
              {
                value: 'agents',
                label: t('navigation.agents'),
                testID: 'marketplace-tab-agents',
                children: (
                  <Text
                    className={
                      tab === 'agents'
                        ? 'font-semibold text-xl text-foreground'
                        : 'font-semibold text-xl text-muted-foreground'
                    }
                  >
                    {t('navigation.agents')}
                  </Text>
                ),
              },
            ]}
            layout="hug"
            onValueChange={setTab}
            value={tab}
            variant="underline"
          />
        </View>
        {tab === 'skills' ? <MarketplaceSkills /> : <AgentTemplateCatalog />}
      </View>
    </>
  );
}
