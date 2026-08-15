// Android's native tab bar accepts image sources, so it uses the Material Symbols PNGs baked by
// the app-icons generator. iOS selects native SF Symbols in its platform module.
const homeIcon = require('../../../../packages/app-icons/src/tab-icons/home.png');
const assistantsIcon = require('../../../../packages/app-icons/src/tab-icons/assistants.png');
const messagesIcon = require('../../../../packages/app-icons/src/tab-icons/messages.png');
const settingsIcon = require('../../../../packages/app-icons/src/tab-icons/settings.png');
const searchIcon = require('../../../../packages/app-icons/src/tab-icons/search.png');

export const tabSceneStyle = { height: '100%' } as const;

export function getTabBarPlatformProps(tabBarColor: string) {
  return {
    activeIndicatorColor: tabBarColor,
    tabBarStyle: { backgroundColor: tabBarColor },
  };
}

export function getHomeIcon() {
  return homeIcon;
}

export function getAssistantsIcon() {
  return assistantsIcon;
}

export function getMessagesIcon() {
  return messagesIcon;
}

export function getSettingsIcon() {
  return settingsIcon;
}

export function getSearchIcon() {
  return searchIcon;
}
