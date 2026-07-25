import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useRouter } from 'expo-router';
import { PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { useMcpServersApi } from '@/hooks/mcp/useMcpServers';
import { SettingsServiceRow } from '../components/SettingsServiceRow';

export function McpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const { servers } = useMcpServersApi();

  const mcpIcon = useMemo(() => resolveProviderIcon('mcp')?.[iconTheme], [iconTheme]);

  const openCreate = useCallback(() => {
    router.push({ pathname: './mcp/[serverId]', params: { serverId: 'new' } });
  }, [router]);

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.mcp.addServer'),
        androidIcon: PlusIcon,
        icon: 'plus',
        key: 'create-mcp-server',
        onPress: openCreate,
      },
    ],
    [openCreate, t],
  );

  return (
    <>
      <BackHeader rightActions={rightActions} title={t('settings.pages.mcp.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {servers.length === 0 ? (
          <Text className="px-1 text-center text-default-foreground text-sm">
            {t('settings.mcp.emptyList')}
          </Text>
        ) : (
          <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
            {servers.map((server) => (
              <SettingsServiceRow
                id={server.id}
                imageSource={mcpIcon}
                isEnabled={server.isActive}
                key={server.id}
                name={server.name}
                onPress={() =>
                  router.push({
                    pathname: './mcp/[serverId]',
                    params: { serverId: server.id },
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
