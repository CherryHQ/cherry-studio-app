import { Text, View } from 'react-native';

export function FilePreviewUnavailable({ label, size }: { label: string; size: number }) {
  return (
    <View className="flex-1 items-center justify-center border border-border bg-secondary p-2 opacity-60">
      {size >= 96 ? (
        <Text className="text-base text-muted-foreground" numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
