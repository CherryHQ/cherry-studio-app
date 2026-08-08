import { PlusIcon } from 'lucide-uniwind/png';
import { Pressable } from 'react-native';

import { useChatInputActions } from '../context/ChatInputProvider';

const buttonSize = 32;

export function ChatInputAddButton() {
  const { openActionSheet } = useChatInputActions();

  return (
    <Pressable
      accessibilityLabel="Add"
      accessibilityRole="button"
      className="items-center justify-center rounded-full bg-secondary active:bg-secondary-active active:opacity-70"
      hitSlop={6}
      onPress={openActionSheet}
      style={{
        height: buttonSize,
        width: buttonSize,
      }}
    >
      <PlusIcon className="size-5 text-foreground" strokeWidth={2} />
    </Pressable>
  );
}
