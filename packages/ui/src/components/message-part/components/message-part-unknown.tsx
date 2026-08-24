import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import { Text, View } from 'react-native';

import type { MessagePartUnknownProps } from '../message-part.types';

export function MessagePartUnknown({ label, testID }: MessagePartUnknownProps) {
  return (
    <View
      accessibilityLabel={label}
      className="flex-row items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3"
      testID={testID}
    >
      <TriangleAlertIcon className="size-4 shrink-0 text-warning" />
      <Text className="text-base text-warning">{label}</Text>
    </View>
  );
}
