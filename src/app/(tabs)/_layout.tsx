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
import { selectIsNestedTabScreen } from '@/frontend/components/navigation/tabBarVisibility';
import {
  SearchScopeProvider,
  useSetSearchScope,
} from '@/frontend/features/search/context/SearchScopeProvider';
import { getSearchScopeForTabRoute } from '@/frontend/features/search/utils/searchScope';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isAndroid } from '@/frontend/utils/constants';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

const filledSceneStyle = { height: '100%' } as const;

// iOS gets native SF Symbols; Android's native tab bar only takes image sources, so it uses the
// Material Symbols PNGs baked by the app-icons generator (see packages/app-icons/src/registry.ts).
const homeIcon = isAndroid
  ? require('../../../packages/app-icons/src/tab-icons/home.png')
  : ({ sfSymbol: 'house' } as const);
const assistantsIcon = isAndroid
  ? require('../../../packages/app-icons/src/tab-icons/assistants.png')
  : ({ sfSymbol: 'person.2' } as const);
const messagesIcon = isAndroid
  ? require('../../../packages/app-icons/src/tab-icons/messages.png')
  : ({ sfSymbol: 'message' } as const);
const settingsIcon = isAndroid
  ? require('../../../packages/app-icons/src/tab-icons/settings.png')
  : ({ sfSymbol: 'gearshape' } as const);
const searchIcon = isAndroid
  ? require('../../../packages/app-icons/src/tab-icons/search.png')
  : ({ sfSymbol: 'magnifyingglass' } as const);

export const unstable_settings = {
  initialRouteName: '(messages)',
};

function getHomeIcon() {
  return homeIcon;
}

function getAssistantsIcon() {
  return assistantsIcon;
}

function getMessagesIcon() {
  return messagesIcon;
}

function getSettingsIcon() {
  return settingsIcon;
}

function getSearchIcon() {
  return searchIcon;
}

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
  const androidTabProps = isAndroid
    ? {
        tabBarStyle: { backgroundColor: tabBarColor },
        activeIndicatorColor: tabBarColor,
      }
    : {};
  const sceneStyle = isAndroid ? filledSceneStyle : undefined;

  return (
    <Tabs
      {...androidTabProps}
      backBehavior="history"
      initialRouteName="(messages)"
      tabBarHidden={isBottomTabBarHidden || isNestedScreen}
      screenOptions={{
        sceneStyle,
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
