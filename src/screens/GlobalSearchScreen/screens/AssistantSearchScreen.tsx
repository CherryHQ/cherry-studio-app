import { ScrollView } from 'react-native';

export function AssistantSearchScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      testID="assistant-search-page"
    />
  );
}
