import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BottomSheet } from '../../bottom-sheet';
import { Image } from '../../image';
import { PrismSweep } from '../../loading';
import type {
  MessagePartReasoningProps,
  MessagePartTone,
  MessagePartToolProps,
} from '../message-part.types';
import { MessagePartStatus } from './message-part-status';

const runningTriggerOpacity = 0.55;
const runningTriggerPulseDurationMs = 700;

const toneClassName = {
  danger: 'text-destructive',
  default: 'text-foreground',
  warning: 'text-warning',
} as const satisfies Record<MessagePartTone, string>;

export function MessagePartReasoning({
  children,
  detailTitle,
  state,
  statusText,
  testID = 'reasoning',
}: MessagePartReasoningProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText}
        onPress={() => setIsOpen(true)}
        testID={`${testID}-trigger`}
      >
        {state === 'running' ? <PrismSweep active /> : null}
        <Text className="flex-1 text-foreground text-base" numberOfLines={1}>
          {statusText}
        </Text>
        <ChevronRightIcon className="size-4 text-foreground" />
      </MessagePartStatus>
      {isOpen ? (
        <MessagePartSheet
          contentClassName="px-4 pb-4"
          onClose={() => setIsOpen(false)}
          testID={`${testID}-detail`}
          title={detailTitle}
        >
          {children}
        </MessagePartSheet>
      ) : null}
    </View>
  );
}

export function MessagePartTool({
  children,
  icon: Icon = WrenchIcon,
  imageSource,
  state,
  statusText,
  statusTone = 'default',
  testID = 'tool-part',
  title,
}: MessagePartToolProps) {
  const [isOpen, setIsOpen] = useState(false);
  const colorClassName = toneClassName[statusTone];
  const isPulsing = state === 'running';
  const trigger = (
    <MessagePartStatus
      accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
      onPress={() => setIsOpen(true)}
      testID={`${testID}-trigger`}
    >
      {imageSource ? (
        <Image
          cachePolicy="memory-disk"
          className="size-5 shrink-0"
          contentFit="contain"
          source={imageSource}
        />
      ) : (
        <Icon className={`size-5 ${colorClassName}`} />
      )}
      <Text className={`min-w-0 flex-1 text-base ${colorClassName}`} numberOfLines={1}>
        {title}
      </Text>
      {statusText ? (
        <Text className={`max-w-[38%] shrink-0 text-base ${colorClassName}`} numberOfLines={1}>
          {statusText}
        </Text>
      ) : null}
      <ChevronRightIcon className={`size-4 shrink-0 ${colorClassName}`} />
    </MessagePartStatus>
  );

  return (
    <View className="gap-1.5">
      {isPulsing ? (
        <MessagePartRunningPulse testID={`${testID}-running-trigger`}>
          {trigger}
        </MessagePartRunningPulse>
      ) : (
        trigger
      )}
      {isOpen ? (
        <MessagePartSheet
          contentClassName="gap-2.5 px-4 pb-4"
          onClose={() => setIsOpen(false)}
          testID={`${testID}-detail`}
          title={title}
        >
          <View className="gap-2.5">{children}</View>
        </MessagePartSheet>
      ) : null}
    </View>
  );
}

function MessagePartRunningPulse({ children, testID }: { children: ReactNode; testID: string }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(1);

    if (!reducedMotion) {
      opacity.set(
        withRepeat(
          withTiming(runningTriggerOpacity, { duration: runningTriggerPulseDurationMs }),
          -1,
          true,
        ),
      );
    }

    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }), [opacity]);

  return (
    <Animated.View style={animatedStyle} testID={testID}>
      {children}
    </Animated.View>
  );
}

function MessagePartSheet({
  children,
  contentClassName,
  onClose,
  testID,
  title,
}: {
  children: ReactNode;
  contentClassName: string;
  onClose: () => void;
  testID: string;
  title: string;
}) {
  return (
    <BottomSheet onClose={onClose} open size="large" testID={testID} title={title}>
      <ScrollView
        className="flex-1"
        contentContainerClassName={contentClassName}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </BottomSheet>
  );
}
