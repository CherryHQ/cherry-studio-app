import { CircleAlertIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@cherrystudio/shared/data/types/message';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const title = part.data.name ?? part.data.code ?? t('chat.errorPart.title');
  const message = part.data.message ?? t('chat.errorPart.message');

  return (
    <View className="gap-1.5 rounded-lg border border-danger bg-danger-soft p-3">
      <View className="flex-row items-center gap-2">
        <CircleAlertIcon className="size-4 text-danger" strokeWidth={2} />
        <Text className="flex-1 font-semibold text-danger text-sm" selectable>
          {title}
        </Text>
      </View>
      <Text className="text-danger text-sm leading-5" selectable>
        {message}
      </Text>
    </View>
  );
}
