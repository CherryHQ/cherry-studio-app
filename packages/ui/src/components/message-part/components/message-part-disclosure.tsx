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
  MessagePartDetailProps,
  MessagePartReasoningProps,
  MessagePartSummaryProps,
  MessagePartTone,
  MessagePartToolProps,
} from '../message-part.types';
import { MessagePartStatus } from './message-part-status';

const runningTriggerOpacity = 0.55;
const runningTriggerPulseDurationMs = 700;
const SOURCE_LIST_DETAIL_SIZES = ['large'] as const;
const TOOL_DETAIL_SIZES = ['compact', 'large'] as const;

const toneClassName = {
  danger: 'text-destructive',
  default: 'text-muted-foreground',
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
        <Text className="flex-1 text-muted-foreground text-sm" numberOfLines={1}>
          {statusText}
        </Text>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" />
      </MessagePartStatus>
      {isOpen ? (
        <MessagePartDetail
          onClose={() => setIsOpen(false)}
          testID={`${testID}-detail`}
          title={detailTitle}
        >
          {children}
        </MessagePartDetail>
      ) : null}
    </View>
  );
}

export function MessagePartTool({
  children,
  detailTitle,
  detailVariant = 'default',
  icon: Icon = WrenchIcon,
  imageSource,
  state,
  statusText,
  statusTone = 'default',
  testID = 'tool-part',
  title,
}: MessagePartToolProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="gap-1.5">
      <MessagePartSummary
        icon={Icon}
        imageSource={imageSource}
        onPress={() => setIsOpen(true)}
        state={state}
        statusText={statusText}
        statusTone={statusTone}
        testID={testID}
        title={title}
      />
      {isOpen ? (
        <MessagePartDetail
          onClose={() => setIsOpen(false)}
          sizes={detailVariant === 'source-list' ? SOURCE_LIST_DETAIL_SIZES : TOOL_DETAIL_SIZES}
          testID={`${testID}-detail`}
          title={detailTitle ?? title}
        >
          {children}
        </MessagePartDetail>
      ) : null}
    </View>
  );
}

export function MessagePartSummary({
  icon: Icon = WrenchIcon,
  imageSource,
  onPress,
  state,
  statusText,
  statusTone = 'default',
  testID = 'message-part-summary',
  title,
}: MessagePartSummaryProps) {
  const colorClassName = toneClassName[statusTone];
  const isPulsing = state === 'running';
  const trigger = (
    <MessagePartStatus
      accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
      onPress={onPress}
      testID={`${testID}-trigger`}
    >
      {imageSource ? (
        <Image
          cachePolicy="memory-disk"
          className="size-4 shrink-0"
          contentFit="contain"
          source={imageSource}
        />
      ) : (
        <Icon className={`size-4 ${colorClassName}`} />
      )}
      <Text className={`min-w-0 flex-1 text-sm ${colorClassName}`} numberOfLines={1}>
        {title}
      </Text>
      {statusText ? (
        <Text className={`max-w-[38%] shrink-0 text-xs ${colorClassName}`} numberOfLines={1}>
          {statusText}
        </Text>
      ) : null}
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </MessagePartStatus>
  );

  return isPulsing ? (
    <MessagePartRunningPulse testID={`${testID}-running-trigger`}>
      {trigger}
    </MessagePartRunningPulse>
  ) : (
    trigger
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

export function MessagePartDetail({
  children,
  onClose,
  sizes,
  testID,
  title,
}: MessagePartDetailProps) {
  // TODO(message-part-detail): Replace arbitrary children with controlled detail layouts after the
  // visual designs for text, structured data, lists, and media are finalized.
  const heightProps = sizes ? { sizes } : ({ size: 'large' } as const);

  return (
    <BottomSheet {...heightProps} onClose={onClose} open testID={testID} title={title}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-2.5 px-4 pb-4"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </BottomSheet>
  );
}
