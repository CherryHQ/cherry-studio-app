import Animated, { Easing, FadeOut } from 'react-native-reanimated';

import { useChatQuoteHighlight } from './ChatQuoteContext';

/**
 * Marks the message a quote opened. It appears with the scroll that lands on it and fades out,
 * bleeding into the row's gutter so the message itself does not move.
 */
export function MessageQuoteHighlight({ messageId }: { messageId: string }) {
  const highlight = useChatQuoteHighlight();
  if (highlight !== messageId) return null;
  return (
    <Animated.View
      className="absolute -inset-2 rounded-2xl bg-secondary"
      exiting={FadeOut.duration(400).easing(Easing.out(Easing.cubic))}
      pointerEvents="none"
    />
  );
}
