import { ScrollView } from 'react-native';

export function MessageSearchScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      testID="message-search-page"
    />
  );
}
