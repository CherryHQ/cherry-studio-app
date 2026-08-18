import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

import { AssistantMessage, UserMessage } from '@/frontend/components/messagePresentation';

import type { MessagePresentationExample } from './messagePresentationFixtures';
import { MessagePresentationStoryProviders } from './MessagePresentationStoryProviders';

export function MessagePresentationStoryFrame({
  examples,
  theme,
}: {
  examples: readonly MessagePresentationExample[];
  theme: 'dark' | 'light';
}) {
  return (
    <ScopedTheme theme={theme}>
      <MessagePresentationStoryProviders>
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-5 py-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          {examples.map(({ label, message }) => (
            <View key={message.id}>
              <Text className="px-4 font-medium text-foreground-tertiary text-sm">{label}</Text>
              {message.role === 'user' ? (
                <UserMessage message={message} />
              ) : (
                <AssistantMessage message={message} />
              )}
            </View>
          ))}
        </ScrollView>
      </MessagePresentationStoryProviders>
    </ScopedTheme>
  );
}
