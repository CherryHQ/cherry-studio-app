import { LanguagesIcon } from 'lucide-uniwind/png';
import { View } from 'react-native';

import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TranslationPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'data-translation' }>;
};

export function TranslationPart({ isStreaming, part }: TranslationPartProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <LanguagesIcon className="size-4 text-foreground-tertiary" strokeWidth={2} />
        <View className="h-px flex-1 bg-border" />
      </View>
      <PartMarkdown isStreaming={isStreaming} markdown={part.data.content} />
    </View>
  );
}
