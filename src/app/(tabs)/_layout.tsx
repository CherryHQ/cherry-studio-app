import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation';
import { withLayoutContext } from 'expo-router';
import type { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import { useNavigationState } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';

import {
  BottomTabBarVisibilityProvider,
  useBottomTabBarHidden,
} from '@/frontend/components/navigation';
import {
  getAssistantsIcon,
  getHomeIcon,
  getMessagesIcon,
  getSearchIcon,
  getSettingsIcon,
  getTabBarPlatformProps,
  tabSceneStyle,
} from '@/frontend/components/navigation/tabBarPlatform';
import { selectIsNestedTabScreen } from '@/frontend/components/navigation/tabBarVisibility';
import {
  SearchScopeProvider,
  useSetSearchScope,
} from '@/frontend/features/search/context/SearchScopeProvider';
import { getSearchScopeForTabRoute } from '@/frontend/features/search/utils/searchScope';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

export const unstable_settings = {
  initialRouteName: '(messages)',
};

export default function TabLayout() {
  return (
    <BottomTabBarVisibilityProvider>
      <SearchScopeProvider>
        <TabNavigator />
      </SearchScopeProvider>
    </BottomTabBarVisibilityProvider>
  );
}

function TabNavigator() {
  const { t } = useTranslation();
  const primaryColor = useThemeColor('primary');
  const tabBarColor = useThemeColor('background-subtle');
  const isBottomTabBarHidden = useBottomTabBarHidden();
  const isNestedScreen = useNavigationState(selectIsNestedTabScreen);
  const setScope = useSetSearchScope();
  const platformTabProps = getTabBarPlatformProps(tabBarColor);

  return (
    <Tabs
      {...platformTabProps}
      backBehavior="history"
      initialRouteName="(messages)"
      tabBarHidden={isBottomTabBarHidden || isNestedScreen}
      screenOptions={{
        sceneStyle: tabSceneStyle,
        // freezeOnBlur 会让冻结中的 tab 错过 uniwind 的免重渲染主题 patch，
        // 解冻后也不补发，导致切主题后整页停留旧主题（见 .context/theme-debug）。
        tabBarActiveTintColor: primaryColor,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          // Eagerly mount so the home content is ready without a first-visit flash.
          lazy: false,
          tabBarIcon: getHomeIcon,
          tabBarLabel: t('navigation.home'),
          title: t('navigation.home'),
        }}
      />
      <Tabs.Screen
        name="assistants"
        options={{
          // Eagerly mount the local query to avoid a first-visit loading flash. If this becomes
          // measurable cold-start work, replace it with targeted assistant-list prefetching.
          lazy: false,
          tabBarIcon: getAssistantsIcon,
          tabBarLabel: t('navigation.assistants'),
          title: t('navigation.assistants'),
        }}
      />
      <Tabs.Screen
        name="(messages)"
        options={{
          tabBarIcon: getMessagesIcon,
          tabBarLabel: t('navigation.messages'),
          title: t('navigation.messages'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          // Eagerly mount so settings is ready without a first-visit flash.
          lazy: false,
          tabBarIcon: getSettingsIcon,
          tabBarLabel: t('navigation.settings'),
          title: t('navigation.settings'),
        }}
      />
      <Tabs.Screen
        name="(search)"
        listeners={({ navigation }) => ({
          tabPress: () => {
            const state = navigation.getState();
            const activeRoute = state.routes[state.index];

            if (activeRoute?.name !== '(search)') {
              setScope(getSearchScopeForTabRoute(activeRoute?.name ?? '(messages)'));
            }
          },
        })}
        options={{
          role: 'search',
          tabBarIcon: getSearchIcon,
          tabBarLabel: t('navigation.search'),
          title: t('navigation.search'),
        }}
      />
    </Tabs>
  );
}
