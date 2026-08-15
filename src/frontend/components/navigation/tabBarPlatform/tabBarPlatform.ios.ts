const homeIcon = { sfSymbol: 'house.fill' } as const;
const assistantsIcon = { sfSymbol: 'person.circle.fill' } as const;
const messagesIcon = { sfSymbol: 'message.fill' } as const;
const settingsIcon = { sfSymbol: 'gear' } as const;
const searchIcon = { sfSymbol: 'magnifyingglass' } as const;

export const tabSceneStyle = undefined;

export function getTabBarPlatformProps(_tabBarColor: string) {
  return {};
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
