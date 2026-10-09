import type { ReactNode } from 'react';
import { View } from 'react-native';

type MessagePartCollapsibleProps = {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  testID?: string;
};

/**
 * Message details can grow while their native Markdown is still being prepared.
 * Use natural layout immediately on disclosure: measuring the whole body into an
 * animated height makes opening depend on renderer progress and keeps retargeting
 * the animation during a stream. Closing unmounts the expensive body immediately.
 */
export function MessagePartCollapsible({
  children,
  className,
  isOpen,
  testID,
}: MessagePartCollapsibleProps) {
  return isOpen ? (
    <View className={className} testID={testID}>
      {children}
    </View>
  ) : null;
}
