import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

import { AssistantMessage, UserMessage } from '@/frontend/components/messages';

import type { MessageExample } from './messageFixtures';
import { MessagesStoryProviders } from './MessagesStoryProviders';

export function MessagesStoryFrame({
  examples,
  theme,
}: {
  examples: readonly MessageExample[];
  theme: 'dark' | 'light';
}) {
  return (
    <ScopedTheme theme={theme}>
      <MessagesStoryProviders>
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-5 py-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          {examples.map(({ label, message }) => (
            <View className="gap-2 px-4" key={message.id}>
              <Text className="font-medium text-foreground-tertiary text-sm">{label}</Text>
              {message.role === 'user' ? (
                <UserMessage message={message} />
              ) : (
                <AssistantMessage message={message} />
              )}
            </View>
          ))}
        </ScrollView>
      </MessagesStoryProviders>
    </ScopedTheme>
  );
}
