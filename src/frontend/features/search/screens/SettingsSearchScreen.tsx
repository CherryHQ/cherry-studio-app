import { ScrollView } from 'react-native';

export function SettingsSearchScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      testID="settings-search-page"
    />
  );
}
