import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from '@bottom-tabs/react-navigation';
import { withLayoutContext } from 'expo-router';
import type { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import { useNavigationState } from 'expo-router/react-navigation';
import { useThemeColor } from 'heroui-native/hooks';
import { useTranslation } from 'react-i18next';
import { BottomTabBarVisibilityProvider, useBottomTabBarHidden } from '@/components/navigation';
import { selectIsNestedTabScreen } from '@/components/navigation/tabBarVisibility';
import { isAndroid } from '@/config/constants';
import {
  SearchScopeProvider,
  useSetSearchScope,
} from '@/screens/GlobalSearchScreen/context/SearchScopeProvider';
import { getSearchScopeForTabRoute } from '@/screens/GlobalSearchScreen/utils/searchScope';

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;

const Tabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

const filledSceneStyle = { height: '100%' } as const;

const homeIcon = require('@/assets/navigation/home.png');
const assistantsIcon = require('@/assets/navigation/assistants.png');
const messagesIcon = require('@/assets/navigation/messages.png');
const settingsIcon = require('@/assets/navigation/settings.png');
const searchIcon = require('../../../packages/lucide-uniwind/src/png-icons/assets/search.png');

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
  const accentColor = useThemeColor('accent');
  const [tabBarColor] = useThemeColor(['background-secondary']);
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
        tabBarActiveTintColor: accentColor,
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
