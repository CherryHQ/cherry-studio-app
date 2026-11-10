import GaugeIcon from '@cherrystudio/app-icons/icons/gauge';
import { Composer } from '@cherrystudio/ui/components';
import { useCallback, useRef } from 'react';
import { Text, View, type ViewInstance } from 'react-native';

import type { ChatInputEffortFrame } from '../utils/chatInputEffortLayout';

type ChatInputEffortGaugeProps = {
  accessibilityLabel: string;
  label: string;
  onPress: (frame: ChatInputEffortFrame) => void;
  stopCount: number;
  valueIndex: number;
};

/** Compact effort control showing the active level beside its gauge glyph. */
export function ChatInputEffortGauge({
  accessibilityLabel,
  label,
  onPress,
}: ChatInputEffortGaugeProps) {
  const footprintRef = useRef<ViewInstance>(null);

  const handlePress = useCallback(() => {
    footprintRef.current?.measureInWindow((left, top, width, height) => {
      if (width > 0 && height > 0) {
        onPress({ height, left, top, width });
      }
    });
  }, [onPress]);

  return (
    <View ref={footprintRef} collapsable={false}>
      <Composer.Pill
        accessibilityLabel={accessibilityLabel}
        icon={<GaugeIcon className="size-3.5 text-foreground" />}
        onPress={handlePress}
        testID="chat-input-effort-gauge"
      >
        <Text
          className="min-w-0 shrink text-xs font-medium text-muted-foreground"
          numberOfLines={1}
        >
          {label}
        </Text>
      </Composer.Pill>
    </View>
  );
}
