import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { withUniwind } from 'uniwind';

type ChatWorkspaceFrameProps = PropsWithChildren;

const StyledView = withUniwind(View);

export function ChatWorkspaceFrame({ children }: ChatWorkspaceFrameProps) {
  return <StyledView className="flex-1 bg-background">{children}</StyledView>;
}
