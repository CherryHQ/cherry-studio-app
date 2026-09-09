import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { SidebarFade } from './SidebarFade/SidebarFade';

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
  const { openSearch } = useSidebarActions('Sidebar.Header');
  const insets = useSafeAreaInsets();
  const headerInset = insets.top + appSidebar.headerRowHeight + appSidebar.headerGapY * 2;

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="box-none">
      {/* Match the body's top inset so the first resting row stays outside the blur. */}
      <SidebarFade edge="top" size={headerInset} />
      <View
        className="absolute right-0 left-0 flex-row items-center gap-2 px-5"
        style={{ height: appSidebar.headerRowHeight, top: insets.top + appSidebar.headerGapY }}
      >
        <Text className="flex-1 font-semibold text-2xl text-sidebar-foreground" numberOfLines={1}>
          Cherry Studio
        </Text>
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
      </View>
    </View>
  );
}

SidebarHeader.displayName = 'Sidebar.Header';
