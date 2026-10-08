import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { Tabs } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { BuiltinToolGroup } from './components/BuiltinToolGroup';
import { McpServerGroup } from './components/McpServerGroup';
import { PluginCatalogGroup } from './components/PluginCatalogGroup';
import { PluginPage } from './components/PluginPage';
import { SkillsPanel } from './skills';

export function PluginListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const tab = getSingleRouteParam(params.tab) === 'skills' ? 'skills' : 'plugins';

  return (
    <>
      <RouteHeader
        title={t('plugins.title')}
        rightActions={
          tab === 'skills'
            ? [
                {
                  accessibilityLabel: t('common.more'),
                  icon: EllipsisIcon,
                  key: 'skill-catalog',
                  type: 'menu',
                  items: [
                    {
                      id: 'skill-discover',
                      label: t('skills.tabs.discover'),
                      onPress: () => router.push('/plugins/skills/discover'),
                    },
                  ],
                },
              ]
            : undefined
        }
      />
      <View className="px-6 py-3">
        <Tabs
          accessibilityLabel={t('plugins.title')}
          items={[
            { label: t('plugins.title'), value: 'plugins' },
            { label: t('skills.title'), value: 'skills' },
          ]}
          value={tab}
          onValueChange={(value) => router.setParams({ tab: value })}
        />
      </View>
      <PluginPage testID={tab === 'skills' ? 'skills-list' : 'plugins-list'}>
        {tab === 'skills' ? (
          <SkillsPanel />
        ) : (
          <>
            <PluginCatalogGroup />
            <McpServerGroup />
            <BuiltinToolGroup />
          </>
        )}
      </PluginPage>
    </>
  );
}
