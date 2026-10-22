import MicIcon from '@cherrystudio/app-icons/icons/mic';
import { Composer } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  type EntryExitAnimationFunction,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useComposerState } from '@/frontend/components/Composer';
import { hasComposerSendableContent } from '@/frontend/components/Composer/utils/composerAttachments';

import { useDictation } from './useDictation';

const swapTiming = { duration: duration.fast, easing: easing.settle };

// Motion: the slot's two actions cross-fade with a slight scale when the draft gains or loses
// content, so the swap reads as one control changing role. Mount-time renders skip it and reduced
// motion swaps instantly.
const enter: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, swapTiming),
      transform: [{ scale: withTiming(1, swapTiming) }],
    },
  };
};

const exit: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, swapTiming),
      transform: [{ scale: withTiming(0.6, swapTiming) }],
    },
  };
};

/**
 * The composer's one primary slot, as in mainstream chat apps: voice input while there is
 * nothing to send, send once there is. Dictation keeps the slot until it ends, even as its text
 * fills the draft; a streaming reply keeps the send button, which stops it.
 */
export function ChatInputPrimaryAction({
  send,
  streaming,
}: {
  send: ReactNode;
  streaming: boolean;
}) {
  const { attachments, draft } = useComposerState();
  const dictation = useDictation();
  const reducedMotion = useReducedMotion();
  const showsDictation =
    dictation.state !== 'idle' || (!streaming && !hasComposerSendableContent(draft, attachments));
  const motion = reducedMotion ? {} : { entering: enter, exiting: exit };

  return (
    <LayoutAnimationConfig skipEntering>
      <View className="size-8">
        <Animated.View
          className="absolute inset-0"
          key={showsDictation ? 'dictation' : 'send'}
          {...motion}
        >
          {showsDictation ? <DictationButton {...dictation} /> : send}
        </Animated.View>
      </View>
    </LayoutAnimationConfig>
  );
}

// The send glyph's circle fills 938 of its 1024 units, so a 32pt icon draws a 29pt disc. Matching
// it keeps the slot one size whichever action holds it.
const DISC_SIZE = 29;
/** Listening rests a little smaller and speech grows it back; the editor clips anything larger. */
const QUIET_SCALE = 0.86;

function DictationButton({ state, level, start, stop }: ReturnType<typeof useDictation>) {
  const { t } = useTranslation();
  const isActive = state !== 'idle';
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (state === 'listening') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [state]);

  // Motion: while listening, the disc breathes with the input level so speaking is visibly heard.
  // It follows each level sample and settles to full size when dictation ends; with reduced motion
  // it stays still and the stop glyph alone marks listening.
  useEffect(() => {
    const target =
      state === 'listening' && !reducedMotion
        ? QUIET_SCALE + Math.min(1, level) * (1 - QUIET_SCALE)
        : 1;
    scale.set(withTiming(target, { duration: 100, easing: easing.settle }));
  }, [level, reducedMotion, scale, state]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Composer.Action
      accessibilityLabel={t(isActive ? 'voice.dictation.stop' : 'voice.dictation.start')}
      className="bg-transparent"
      disabled={state === 'starting' || state === 'finishing'}
      onPress={() => {
        if (isActive) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          stop();
        } else {
          void start();
        }
      }}
      testID="chat-composer-dictation"
    >
      <Animated.View
        className="items-center justify-center rounded-full bg-foreground"
        style={[{ height: DISC_SIZE, width: DISC_SIZE }, discStyle]}
      >
        {isActive ? (
          <View className="size-2.5 rounded-[3px] bg-background" />
        ) : (
          <MicIcon className="size-[17px] text-background" />
        )}
      </Animated.View>
    </Composer.Action>
  );
}
