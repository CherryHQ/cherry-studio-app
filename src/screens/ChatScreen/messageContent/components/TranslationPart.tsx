import { LanguagesIcon } from 'lucide-uniwind/png';
import { View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';

import { PartMarkdown } from './PartMarkdown';

type TranslationPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-translation' }>;
};

export function TranslationPart({ part }: TranslationPartProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <LanguagesIcon className="size-4 text-foreground-muted" strokeWidth={2} />
        <View className="h-px flex-1 bg-border" />
      </View>
      <PartMarkdown markdown={part.data.content} />
    </View>
  );
}
