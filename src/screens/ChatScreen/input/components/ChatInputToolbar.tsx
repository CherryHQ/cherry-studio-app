import { XIcon } from 'lucide-uniwind';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import type { ChatInputAction } from '@/screens/ChatScreen/input/utils/chatInputActions';

type ChatInputToolbarProps = {
  onToolClear: () => void;
  selectedTool?: ChatInputAction;
};

type SelectedToolTagProps = {
  onClear: () => void;
  tool: ChatInputAction;
};

const chatInputToolbarTimingConfig = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.Never,
} as const satisfies WithTimingConfig;
const chatInputToolbarLayoutTransition = LinearTransition.duration(
  chatInputToolbarTimingConfig.duration,
)
  .easing(chatInputToolbarTimingConfig.easing)
  .reduceMotion(chatInputToolbarTimingConfig.reduceMotion);
const selectedToolTagEntering = FadeIn.duration(chatInputToolbarTimingConfig.duration)
  .easing(chatInputToolbarTimingConfig.easing)
  .reduceMotion(chatInputToolbarTimingConfig.reduceMotion);
const selectedToolTagExiting = FadeOut.duration(chatInputToolbarTimingConfig.duration)
  .easing(chatInputToolbarTimingConfig.easing)
  .reduceMotion(chatInputToolbarTimingConfig.reduceMotion);

const StyledAnimatedView = withUniwind(Animated.View);
const StyledPressable = withUniwind(Pressable);

export function ChatInputToolbar({ onToolClear, selectedTool }: ChatInputToolbarProps) {
  if (!selectedTool) {
    return null;
  }

  return <SelectedToolTag tool={selectedTool} onClear={onToolClear} />;
}

function SelectedToolTag({ onClear, tool }: SelectedToolTagProps) {
  const { t } = useTranslation();
  const Icon = tool.icon;

  return (
    <StyledAnimatedView
      className="self-start p-2"
      entering={selectedToolTagEntering}
      exiting={selectedToolTagExiting}
      layout={chatInputToolbarLayoutTransition}
    >
      <View className="flex-row items-center gap-2 rounded-full bg-accent/10 px-2 py-1">
        <Icon className="size-5 text-accent" strokeWidth={2.25} />
        <Text className="font-semibold text-accent text-base" numberOfLines={1}>
          {t(tool.tagTitleKey)}
        </Text>
        <StyledPressable
          accessibilityLabel={t('common.clear')}
          accessibilityRole="button"
          className="size-7 items-center justify-center rounded-full active:opacity-60"
          hitSlop={6}
          onPress={onClear}
        >
          <XIcon className="size-5 text-accent" strokeWidth={2.25} />
        </StyledPressable>
      </View>
    </StyledAnimatedView>
  );
}
