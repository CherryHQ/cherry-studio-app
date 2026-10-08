import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { ActionMenu, type MenuItem, Surface } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';
import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { SidebarFade } from './SidebarFade/SidebarFade';
import { SidebarTitle } from './SidebarTitle';

/**
 * Brand row floating over the body, which scrolls underneath it. The blur band
 * dissolves rows as they rise past the title instead of cutting them at a hard
 * edge.
 *
 * `box-none` on the container: the band itself must not eat touches meant for
 * the rows underneath.
 */
export function SidebarHeader() {
  const { t } = useTranslation();
  const { openSearch } = useSidebarActions('SidebarHeader');
  const insets = useSafeAreaInsets();
  const headerInset = insets.top + appSidebar.headerRowHeight + appSidebar.headerGapY * 2;

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="box-none">
      {/* Match the body's top inset so the first resting row stays outside the blur. */}
      <SidebarFade edge="top" size={headerInset} />
      <View
        className="absolute right-0 left-0 flex-row items-center gap-2 px-5"
        style={{
          height: appSidebar.headerRowHeight,
          paddingLeft: 20 + insets.left,
          top: insets.top + appSidebar.headerGapY,
        }}
      >
        <SidebarDeviceTitle />
        {openSearch ? (
          <Surface interactive shape="circle">
            <Pressable
              accessibilityLabel={t('session.search.placeholder')}
              accessibilityRole="button"
              hitSlop={4}
              onPress={openSearch}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: appSidebar.headerRowHeight,
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
                width: appSidebar.headerRowHeight,
              })}
              testID="sidebar-search"
            >
              <SearchIcon className="size-5 text-sidebar-foreground" />
            </Pressable>
          </Surface>
        ) : null}
      </View>
    </View>
  );
}

const brand = 'Cherry Studio';
/** The disclosure chevron (`size-4`) and its `gap-1` leading space. */
const chevronWidth = 20;

/**
 * The title names whose chats the drawer shows: the brand for this phone, or the selected desktop.
 * Once a desktop is paired it becomes the device switcher; until then it stays plain text.
 */
function SidebarDeviceTitle() {
  const { t } = useTranslation();
  const router = useRouter();
  const { closeDrawer } = useSidebarActions('SidebarDeviceTitle');
  const { source, remoteTarget, selectDevice } = useChatSource();
  const { connections } = useDesktopConnections();
  const current =
    source === 'remote'
      ? connections.find((connection) => connection.id === remoteTarget.connectionId)
      : undefined;
  const name = current?.name ?? brand;
  const [width, setWidth] = useState(0);
  const frame = (content: ReactNode) => (
    <View
      className="flex-1 flex-row"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {content}
    </View>
  );
  if (!connections.length) return frame(<SidebarTitle name={name} width={width} />);
  const items: MenuItem[] = [
    {
      group: 'devices',
      id: 'device-local',
      checked: source === 'local',
      label: brand,
      onPress: () => selectDevice(),
    },
    ...connections.map((connection) => ({
      group: 'devices',
      id: `device-${connection.id}`,
      checked: source === 'remote' && connection.id === remoteTarget.connectionId,
      label: connection.name,
      onPress: () => selectDevice(connection.id),
    })),
    {
      group: 'manage',
      id: 'manage-devices',
      label: t('navigation.manageDevices'),
      onPress: () => {
        closeDrawer();
        router.push('/settings/device-connections');
      },
    },
  ];
  return frame(
    <ActionMenu items={items}>
      <View
        accessibilityLabel={t('navigation.deviceSwitcher', { name })}
        accessibilityRole="button"
        className="min-w-0 flex-row items-center gap-1"
        testID="sidebar-device-switcher"
      >
        <SidebarTitle name={name} width={Math.max(0, width - chevronWidth)} />
        <ChevronDownIcon className="size-4 text-muted-foreground" strokeWidth={2} />
      </View>
    </ActionMenu>,
  );
}
