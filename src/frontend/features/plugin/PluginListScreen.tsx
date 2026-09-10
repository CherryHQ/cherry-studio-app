import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';

import { PluginIcon } from './components/PluginIcon';
import { PLUGIN_IDS } from './pluginCatalog';
import { usePluginConnections } from './usePluginConnections';

export function PluginListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const connections = usePluginConnections();

  return (
    <>
      <RouteHeader title={t('plugins.title')} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 px-5 py-3"
        contentInsetAdjustmentBehavior="automatic"
        testID="plugins-list"
      >
        {connections.isError ? (
          <ContentState.Error
            title={t('plugins.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void connections.refetch(),
            }}
          />
        ) : null}
        <View>
          {PLUGIN_IDS.map((id) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(`plugins.catalog.${id}.name`)}
              key={id}
              className="flex-row items-center gap-3 rounded-xl py-4 active:bg-secondary"
              onPress={() =>
                router.push({ pathname: '/plugins/[pluginId]', params: { pluginId: id } })
              }
              testID={`plugin-${id}`}
            >
              <PluginIcon pluginId={id} />
              <View className="flex-1 gap-1">
                <Text className="text-base font-medium text-foreground">
                  {t(`plugins.catalog.${id}.name`)}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t(`plugins.catalog.${id}.summary`)}
                </Text>
                {connections.data?.some((item) => item.pluginId === id) ? (
                  <Text className="text-xs text-success">{t('plugins.connected')}</Text>
                ) : null}
              </View>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  );
}
