import GaugeIcon from '@cherrystudio/app-icons/icons/gauge';
import { Composer } from '@cherrystudio/ui/components';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';

import type { ChatInputEffortFrame } from '../utils/chatInputEffortLayout';

type ChatInputEffortGaugeProps = {
  accessibilityLabel: string;
  onPress: (frame: ChatInputEffortFrame) => void;
  stopCount: number;
  valueIndex: number;
};

/** Compact effort control using the same gauge glyph as desktop. */
export function ChatInputEffortGauge({ accessibilityLabel, onPress }: ChatInputEffortGaugeProps) {
  const footprintRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    footprintRef.current?.measureInWindow((left, top, width, height) => {
      if (width > 0 && height > 0) {
        onPress({ height, left, top, width });
      }
    });
  }, [onPress]);

  return (
    <View ref={footprintRef} collapsable={false} style={gaugeFootprintStyle}>
      <Composer.Action
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        testID="chat-input-effort-gauge"
      >
        <GaugeIcon className="size-3.5 text-foreground" />
      </Composer.Action>
    </View>
  );
}

const gaugeFootprintStyle = { height: 32, width: 32 } as const;
