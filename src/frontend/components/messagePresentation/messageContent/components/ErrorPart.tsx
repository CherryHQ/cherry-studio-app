import { CircleAlertIcon } from '@cherrystudio/app-icons';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const title = part.data.name ?? part.data.code ?? t('chat.errorPart.title');
  const message = part.data.message ?? t('chat.errorPart.message');

  return (
    <View className="gap-1.5 rounded-lg border border-destructive bg-danger-soft p-3">
      <View className="flex-row items-center gap-2">
        <CircleAlertIcon className="size-4 text-destructive" />
        <Text className="flex-1 font-semibold text-destructive text-base" selectable>
          {title}
        </Text>
      </View>
      <Text className="text-destructive text-base" selectable>
        {message}
      </Text>
    </View>
  );
}
