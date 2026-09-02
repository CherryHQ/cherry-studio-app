import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import ListChecksIcon from '@cherrystudio/app-icons/icons/list-checks';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing } from '../../../motion';
import { BottomSheet } from '../../bottom-sheet';
import { Image } from '../../image';
import { PrismSweep } from '../../loading';
import { ShimmerText } from '../../shimmer-text';
import type {
  MessagePartDetailProps,
  MessagePartReasoningProps,
  MessagePartSummaryProps,
  MessagePartTone,
  MessagePartToolGroupProps,
  MessagePartToolProps,
} from '../message-part.types';
import { MessagePartCollapsible } from './message-part-collapsible';
import { MessagePartStatus } from './message-part-status';

const SOURCE_LIST_DETAIL_SIZES = ['large'] as const;
const TOOL_DETAIL_SIZES = ['compact', 'large'] as const;
const disclosureIconMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

const toneClassName = {
  danger: 'text-destructive',
  default: 'text-muted-foreground',
  warning: 'text-warning',
} as const satisfies Record<MessagePartTone, string>;

export function MessagePartReasoning({
  children,
  onDisclosureToggle,
  state,
  statusText,
  testID = 'reasoning',
}: MessagePartReasoningProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === 'running';
  const toggle = () => {
    onDisclosureToggle?.();
    setIsOpen((open) => !open);
  };

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText}
        expanded={isOpen}
        onPress={toggle}
        testID={`${testID}-trigger`}
      >
        {isRunning ? <PrismSweep active /> : null}
        <View className="min-w-0 flex-1">
          {isRunning ? (
            <ShimmerText className="text-sm" numberOfLines={1}>
              {statusText}
            </ShimmerText>
          ) : (
            <Text className="text-muted-foreground text-sm" numberOfLines={1}>
              {statusText}
            </Text>
          )}
        </View>
        <MessagePartDisclosureIcon isOpen={isOpen} />
      </MessagePartStatus>
      <MessagePartCollapsible
        className="border-border border-l-2 pl-3"
        isOpen={isOpen}
        testID={`${testID}-detail`}
      >
        {children}
      </MessagePartCollapsible>
    </View>
  );
}

export function MessagePartToolGroup({
  children,
  onDisclosureToggle,
  state,
  statusText,
  statusTone = 'default',
  testID = 'tool-group',
  title,
}: MessagePartToolGroupProps) {
  // While the run is live the steps stay visible; once it settles the group
  // collapses to its summary. A manual toggle always wins over that default.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isRunning = state === 'running';
  const isOpen = manualOpen ?? isRunning;
  const colorClassName = toneClassName[statusTone];
  const toggle = () => {
    onDisclosureToggle?.();
    setManualOpen(!isOpen);
  };

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
        expanded={isOpen}
        onPress={toggle}
        testID={`${testID}-trigger`}
      >
        <ListChecksIcon className={`size-4 ${colorClassName}`} />
        <View className="min-w-0 flex-1">
          {isRunning ? (
            <ShimmerText className="text-sm" numberOfLines={1}>
              {title}
            </ShimmerText>
          ) : (
            <Text className={`text-sm ${colorClassName}`} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>
        {statusText ? (
          <Text className={`max-w-[38%] shrink-0 text-xs ${colorClassName}`} numberOfLines={1}>
            {statusText}
          </Text>
        ) : null}
        <MessagePartDisclosureIcon isOpen={isOpen} />
      </MessagePartStatus>
      <MessagePartCollapsible className="gap-1" isOpen={isOpen} testID={`${testID}-steps`}>
        {children}
      </MessagePartCollapsible>
    </View>
  );
}

function MessagePartDisclosureIcon({ isOpen }: { isOpen: boolean }) {
  const rotation = useSharedValue(isOpen ? 90 : 0);

  useEffect(() => {
    rotation.set(withTiming(isOpen ? 90 : 0, disclosureIconMotion));
  }, [isOpen, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={animatedStyle}>
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </Animated.View>
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
          variant={detailVariant}
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
  const isRunning = state === 'running';

  return (
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
      <View className="min-w-0 flex-1">
        {isRunning ? (
          <ShimmerText className="text-sm" numberOfLines={1} testID={`${testID}-running-title`}>
            {title}
          </ShimmerText>
        ) : (
          <Text className={`text-sm ${colorClassName}`} numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {statusText ? (
        <Text className={`max-w-[38%] shrink-0 text-xs ${colorClassName}`} numberOfLines={1}>
          {statusText}
        </Text>
      ) : null}
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </MessagePartStatus>
  );
}

export function MessagePartDetail({
  children,
  onClose,
  sizes,
  testID,
  title,
  variant = 'default',
}: MessagePartDetailProps) {
  // TODO(message-part-detail): Replace arbitrary children with controlled detail layouts after the
  // visual designs for text, structured data, lists, and media are finalized.
  const heightProps = sizes ? { sizes } : ({ size: 'large' } as const);

  return (
    <BottomSheet {...heightProps} onClose={onClose} open testID={testID} title={title}>
      <ScrollView
        className="flex-1"
        contentContainerClassName={
          variant === 'source-list' ? 'gap-2.5 px-3 pb-4' : 'gap-2.5 px-4 pb-4'
        }
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </BottomSheet>
  );
}
