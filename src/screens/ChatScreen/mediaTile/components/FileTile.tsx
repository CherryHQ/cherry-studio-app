import { cn } from 'heroui-native/utils';
import { Pressable, Text, View } from 'react-native';
import { getFileBaseName, getFileExtension } from '../utils/getFileExtension';

type FileTileProps = {
  accessibilityLabel?: string;
  className?: string;
  name: string;
  onPress?: () => void;
};

export function FileTile({ accessibilityLabel, className, name, onPress }: FileTileProps) {
  const extension = getFileExtension(name);
  const baseName = getFileBaseName(name);
  const containerClassName = cn(
    'size-28 items-start justify-between overflow-hidden rounded-2xl border border-border bg-surface-secondary p-2',
    onPress && 'active:opacity-70',
    className,
  );
  const content = (
    <>
      {extension ? (
        <View className="rounded-md border border-border px-1.5 py-0.5">
          <Text className="font-semibold text-default-foreground text-xs">{extension}</Text>
        </View>
      ) : (
        <View />
      )}
      <Text className="text-default-foreground text-xs" numberOfLines={3}>
        {baseName}
      </Text>
    </>
  );

  if (!onPress) {
    return <View className={containerClassName}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityRole="button"
      className={containerClassName}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}
