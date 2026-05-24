import { CircleAlertIcon } from 'lucide-uniwind';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

export function ErrorPart({ part }: ErrorPartProps) {
  const title = part.data.name ?? part.data.code ?? 'Error';
  const message = part.data.message ?? 'Unknown error';

  return (
    <View className="flex-row gap-2 rounded-lg border border-danger bg-danger-soft p-3">
      <CircleAlertIcon className="mt-0.5 size-4 text-danger" strokeWidth={2} />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-danger text-sm" selectable>
          {title}
        </Text>
        <Text className="text-danger text-sm leading-5" selectable>
          {message}
        </Text>
      </View>
    </View>
  );
}
