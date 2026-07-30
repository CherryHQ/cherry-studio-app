import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

type ChatWorkspaceFrameProps = PropsWithChildren;

export function ChatWorkspaceFrame({ children }: ChatWorkspaceFrameProps) {
  return <View className="flex-1 bg-background">{children}</View>;
}
