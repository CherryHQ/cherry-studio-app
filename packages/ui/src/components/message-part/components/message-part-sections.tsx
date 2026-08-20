import { Text, View } from 'react-native';

import type {
  MessagePartSectionTitleProps,
  MessagePartTextSectionProps,
  MessagePartValueSectionProps,
} from '../message-part.types';
import { formatMessagePartValue, getMessagePartValueEntries } from '../utils/message-part-value';

export function MessagePartValueSection({
  maxLength = 4000,
  title,
  value,
}: MessagePartValueSectionProps) {
  const entries = getMessagePartValueEntries(value);
  if (entries.length === 0) return null;

  return (
    <View className="gap-1">
      <MessagePartSectionTitle title={title} />
      <View className="gap-1">
        {entries.map(([key, entryValue]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-foreground text-base" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-foreground text-base" selectable>
              {formatMessagePartValue(entryValue, maxLength)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MessagePartTextSection({ title, tone, value }: MessagePartTextSectionProps) {
  return (
    <View className="gap-1">
      <MessagePartSectionTitle title={title} />
      <Text
        className={
          tone === 'danger'
            ? 'font-mono text-destructive text-base'
            : 'font-mono text-foreground text-base'
        }
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function MessagePartSectionTitle({ title }: MessagePartSectionTitleProps) {
  return (
    <Text className="text-foreground text-base" selectable>
      {title}
    </Text>
  );
}
