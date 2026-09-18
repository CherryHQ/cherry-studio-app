import { BlurTargetView } from 'expo-blur';
import { type ComponentType, type PropsWithChildren, type RefObject, useRef } from 'react';
import { View } from 'react-native';

import { ReadingContentFrame } from '@/frontend/appShell/layout';

export function ChatScreenFrame({
  children,
  header: Header,
}: PropsWithChildren<{ header: ComponentType<{ blurTarget: RefObject<View | null> }> }>) {
  const blurTarget = useRef<View>(null);
  return (
    <>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <View className="flex-1 bg-chat-background">
          <ReadingContentFrame>{children}</ReadingContentFrame>
        </View>
      </BlurTargetView>
      <Header blurTarget={blurTarget} />
    </>
  );
}
