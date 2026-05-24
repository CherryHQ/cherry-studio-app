import { PlusIcon } from 'lucide-uniwind';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';
import { chatInputMinTextAreaHeight } from '@/screens/ChatScreen/input/chatInputLayout';
import { useChatInputActions } from '@/screens/ChatScreen/input/context/ChatInputProvider';

type ChatInputAddButtonProps = {
  separatedSurfaceStyle: AnimatedStyle<ViewStyle>;
};

const inputSurfaceClassName =
  'border-[1.5px] border-field-border bg-field ios:shadow-field android:shadow-sm';

const StyledAnimatedView = withUniwind(Animated.View);
const StyledPressable = withUniwind(Pressable);

export function ChatInputAddButton({ separatedSurfaceStyle }: ChatInputAddButtonProps) {
  const { openActionSheet } = useChatInputActions();

  return (
    <StyledPressable
      accessibilityLabel="Add"
      accessibilityRole="button"
      className="items-center justify-center rounded-full active:opacity-70"
      hitSlop={6}
      onPress={openActionSheet}
      style={{
        height: chatInputMinTextAreaHeight,
        width: chatInputMinTextAreaHeight,
      }}
    >
      <StyledAnimatedView
        className={`absolute inset-0 rounded-full ${inputSurfaceClassName}`}
        pointerEvents="none"
        style={separatedSurfaceStyle}
      />
      <PlusIcon className="size-5 text-foreground" strokeWidth={2} />
    </StyledPressable>
  );
}
