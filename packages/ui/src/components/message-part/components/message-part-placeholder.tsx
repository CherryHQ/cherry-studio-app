import { Pressable, Text, View } from 'react-native';

import { DotMatrixSquare20 } from '../../loading';
import type { MessagePartPlaceholderProps } from '../message-part.types';

export function MessagePartPlaceholder({
  description,
  label,
  onPress,
}: MessagePartPlaceholderProps) {
  const hasDescription = Boolean(description);
  const containerClassName = `flex-row gap-2 rounded-lg border border-border bg-secondary p-3 ${
    hasDescription ? '' : 'items-center'
  }`;
  const content = (
    <>
      <View className={hasDescription ? 'mt-0.5' : undefined}>
        <DotMatrixSquare20 size={20} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-foreground text-base" selectable>
          {label}
        </Text>
        {description ? (
          <Text className="text-foreground text-base" selectable>
            {description}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="link"
        className={`${containerClassName} active:opacity-70`}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={containerClassName}>{content}</View>;
}
