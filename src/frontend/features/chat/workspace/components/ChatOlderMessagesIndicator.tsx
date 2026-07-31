import { ActivityIndicator, View } from 'react-native';

type ChatOlderMessagesIndicatorProps = {
  isLoading: boolean;
};

export function ChatOlderMessagesIndicator({ isLoading }: ChatOlderMessagesIndicatorProps) {
  if (!isLoading) {
    return null;
  }

  return (
    <View className="flex-row items-center justify-center gap-2 border-b border-border bg-surface-secondary px-3 py-1.5">
      <ActivityIndicator size="small" />
    </View>
  );
}
