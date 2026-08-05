import { cn } from '@cherrystudio/ui/utils';
import { type PropsWithChildren } from 'react';
import { type ViewProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { chatInputFadeIn, chatInputLayoutTransition } from '../utils/chatInputMotion';

type ChatInputAccessorySectionProps = PropsWithChildren<
  ViewProps & {
    className?: string;
  }
>;

type ChatInputAccessoryItemProps = PropsWithChildren<
  ViewProps & {
    className?: string;
  }
>;

export function ChatInputAccessorySection({
  children,
  className,
  style,
  ...props
}: ChatInputAccessorySectionProps) {
  return (
    <Animated.View
      className={cn('overflow-hidden', className)}
      layout={chatInputLayoutTransition}
      style={style}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

export function ChatInputAccessoryItem({
  children,
  className,
  ...props
}: ChatInputAccessoryItemProps) {
  return (
    <Animated.View
      className={className}
      entering={chatInputFadeIn}
      layout={chatInputLayoutTransition}
      {...props}
    >
      {children}
    </Animated.View>
  );
}
