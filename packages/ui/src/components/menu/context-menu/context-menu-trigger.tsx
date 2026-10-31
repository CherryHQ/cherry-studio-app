import { createContext, use } from 'react';
import {
  type LongPressGesture,
  Pressable,
  type PressableProps,
} from 'react-native-gesture-handler';

import { useScrollInteraction } from '../../scroll-interaction/scroll-interaction-context';
import type { ContextMenuTriggerProps } from '../menu.types';

export const ContextMenuGestureContext = createContext<LongPressGesture | undefined>(undefined);

/** Keep tap recognition in RNGH while giving the enclosing menu priority. */
export function ContextMenuTrigger({ onPress, ...props }: ContextMenuTriggerProps) {
  const longPress = use(ContextMenuGestureContext);
  const scrollInteraction = useScrollInteraction();
  // Navigation links can inject an event-aware callback through asChild.
  const handlePress: PressableProps['onPress'] = onPress;

  // Keep the relation even while the menu is disabled. Removing it switches
  // RNGH Pressable's implementation and remounts the content during an interaction.
  return (
    <Pressable
      {...props}
      onPress={(event) => {
        // Failing the menu for a momentum-stopping touch must not promote
        // that same touch to a tap. The scroll owner keeps cancellation sticky.
        if (!longPress || !scrollInteraction?.isRecognitionBlocked()) handlePress?.(event);
      }}
      requireToFail={longPress}
    />
  );
}
