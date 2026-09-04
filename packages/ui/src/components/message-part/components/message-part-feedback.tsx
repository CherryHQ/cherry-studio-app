import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import { Pressable, Text, View } from 'react-native';

import type { MessagePartErrorProps } from '../message-part.types';

const errorClassName = 'gap-1.5 rounded-lg border border-error-border bg-error-subtle p-3';

export function MessagePartError({
  accessibilityHint,
  message,
  onPress,
  title,
}: MessagePartErrorProps) {
  const content = (
    <>
      <View className="flex-row items-center gap-2">
        <TriangleAlertIcon className="text-error-subtle-foreground" size={15} />
        <Text className="flex-1 font-semibold text-base text-error-subtle-foreground" selectable>
          {title}
        </Text>
        {onPress ? (
          <ChevronRightIcon className="size-4 shrink-0 text-error-subtle-foreground" />
        ) : null}
      </View>
      <Text className="text-base text-error-subtle-foreground" selectable>
        {message}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={`${title}, ${message}`}
        accessibilityRole="button"
        className={`${errorClassName} active:opacity-80`}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View className={errorClassName}>{content}</View>;
}
