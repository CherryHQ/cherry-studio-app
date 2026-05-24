import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  type WithTimingConfig,
  withTiming,
} from 'react-native-reanimated';
import { withUniwind } from 'uniwind';
import {
  chatInputControlGap,
  chatInputMergedAddButtonSlotWidth,
  chatInputMinTextAreaHeight,
} from '@/screens/ChatScreen/input/chatInputLayout';
import { ChatInputAddButton } from '@/screens/ChatScreen/input/components/ChatInputAddButton';
import { ChatInputTextArea } from '@/screens/ChatScreen/input/components/ChatInputTextArea';
import { ChatInputToolbar } from '@/screens/ChatScreen/input/components/ChatInputToolbar';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';

const mergedInputOffset = chatInputMinTextAreaHeight + chatInputControlGap;
const inputSurfaceClassName =
  'border-[1.5px] border-field-border bg-field ios:shadow-field android:shadow-sm';
const inputSurfaceBackgroundClassName = `absolute inset-0 rounded-3xl ${inputSurfaceClassName}`;
const chatInputTimingConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;
const chatInputLayoutTransition = LinearTransition.duration(chatInputTimingConfig.duration)
  .easing(chatInputTimingConfig.easing)
  .reduceMotion(chatInputTimingConfig.reduceMotion);

const StyledAnimatedView = withUniwind(Animated.View);
const inputControlSurfaceStyle = {
  minHeight: chatInputMinTextAreaHeight,
};

export function ChatInputSurface() {
  const { clearSelectedTool } = useChatInputActions();
  const { isInputFocused, selectedTool } = useChatInputState();
  const surfaceContentProgress = useSharedValue(0);
  const hasSurfaceContent = isInputFocused || selectedTool !== undefined;

  useEffect(() => {
    surfaceContentProgress.value = withTiming(hasSurfaceContent ? 1 : 0, chatInputTimingConfig);
  }, [hasSurfaceContent, surfaceContentProgress]);

  const controlGroupStyle = useAnimatedStyle(() => ({
    marginLeft: ((1 - surfaceContentProgress.value) * mergedInputOffset) / 2,
    marginRight: ((1 - surfaceContentProgress.value) * mergedInputOffset) / 2,
  }));

  const controlGapStyle = useAnimatedStyle(() => ({
    width: surfaceContentProgress.value * chatInputControlGap,
  }));

  const mergedSurfaceStyle = useAnimatedStyle(() => ({
    opacity: 1 - surfaceContentProgress.value,
  }));

  const separatedSurfaceStyle = useAnimatedStyle(() => ({
    opacity: surfaceContentProgress.value,
  }));

  const addButtonSlotStyle = useAnimatedStyle(() => ({
    alignSelf: 'flex-end',
    width:
      chatInputMergedAddButtonSlotWidth +
      surfaceContentProgress.value *
        (chatInputMinTextAreaHeight - chatInputMergedAddButtonSlotWidth),
  }));

  return (
    <View className="flex-row items-end">
      <StyledAnimatedView
        className="flex-1 flex-row items-end"
        layout={chatInputLayoutTransition}
        style={[inputControlSurfaceStyle, controlGroupStyle]}
      >
        <StyledAnimatedView
          className={inputSurfaceBackgroundClassName}
          pointerEvents="none"
          style={mergedSurfaceStyle}
        />
        <Animated.View layout={chatInputLayoutTransition} style={addButtonSlotStyle}>
          <ChatInputAddButton separatedSurfaceStyle={separatedSurfaceStyle} />
        </Animated.View>
        <Animated.View style={controlGapStyle} />
        <StyledAnimatedView
          className="flex-1"
          layout={chatInputLayoutTransition}
          style={inputControlSurfaceStyle}
        >
          <StyledAnimatedView
            className={inputSurfaceBackgroundClassName}
            pointerEvents="none"
            style={separatedSurfaceStyle}
          />
          <StyledAnimatedView
            className="overflow-hidden rounded-3xl"
            layout={chatInputLayoutTransition}
          >
            <ChatInputToolbar selectedTool={selectedTool} onToolClear={clearSelectedTool} />
            <ChatInputTextArea />
          </StyledAnimatedView>
        </StyledAnimatedView>
      </StyledAnimatedView>
    </View>
  );
}
