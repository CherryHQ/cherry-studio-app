import { Composer, useComposerExpansion } from '@cherrystudio/ui/components';
import { BlurTargetView } from 'expo-blur';
import { type ComponentType, type PropsWithChildren, type RefObject, useRef } from 'react';
import { View } from 'react-native';

import { ReadingContentFrame } from '@/frontend/appShell/layout';

export function ChatScreenFrame({
  children,
  header: Header,
}: PropsWithChildren<{
  header: ComponentType<{ blurTarget: RefObject<View | null>; hidden?: boolean }>;
}>) {
  return (
    <Composer.Expansion>
      <ChatScreenContent header={Header}>{children}</ChatScreenContent>
    </Composer.Expansion>
  );
}

function ChatScreenContent({
  children,
  header: Header,
}: PropsWithChildren<{
  header: ComponentType<{ blurTarget: RefObject<View | null>; hidden?: boolean }>;
}>) {
  const blurTarget = useRef<View>(null);
  const expansion = useComposerExpansion();
  return (
    <>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <View className="flex-1 bg-chat-background">
          <ReadingContentFrame>{children}</ReadingContentFrame>
        </View>
      </BlurTargetView>
      <Header blurTarget={blurTarget} hidden={expansion?.state.isPresented} />
    </>
  );
}
