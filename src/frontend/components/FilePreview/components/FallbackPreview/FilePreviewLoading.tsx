import { ActivityIndicator, Text, View } from 'react-native';

export function FilePreviewLoading({ label, size }: { label: string; size: number }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 border border-border bg-secondary p-2">
      <ActivityIndicator size="small" />
      {size >= 96 ? (
        <Text className="text-base text-muted-foreground" numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
