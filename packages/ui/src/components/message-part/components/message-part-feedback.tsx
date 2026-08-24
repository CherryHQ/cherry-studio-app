import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Text, View } from 'react-native';

import type { MessagePartErrorProps } from '../message-part.types';

export function MessagePartError({ message, title }: MessagePartErrorProps) {
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
