import { ScrollView, Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';

export function FileTextBody({
  text,
  variant,
}: {
  text: string;
  variant: 'markdown' | 'source' | 'text';
}) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="p-4 pb-safe-offset-4">
      {variant === 'markdown' ? (
        <MarkdownText markdown={text} selectable={false} />
      ) : variant === 'text' ? (
        <Text className="text-base text-foreground" selectable={false}>
          {text}
        </Text>
      ) : (
        <ScrollView horizontal>
          <View>
            <Text className="font-mono text-base text-foreground" selectable={false}>
              {text}
            </Text>
          </View>
        </ScrollView>
      )}
    </ScrollView>
  );
}
