import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Pressable, Text, View } from 'react-native';

/** A gallery section title, with an optional quiet "see all" action on the right. */
export function GallerySectionHeader({
  action,
  title,
}: {
  action?: { label: string; onPress: () => void; testID?: string };
  title: string;
}) {
  return (
    <View className="min-h-8 flex-row items-center justify-between px-4">
      <Text accessibilityRole="header" className="font-semibold text-foreground text-xl">
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.label}
          accessibilityRole="button"
          className="flex-row items-center gap-0.5 active:opacity-60"
          hitSlop={10}
          onPress={action.onPress}
          testID={action.testID}
        >
          <Text className="text-muted-foreground text-sm">{action.label}</Text>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
