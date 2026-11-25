import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { BottomSheet } from '../../bottom-sheet';
import { DisclosureChevron } from '../../disclosure';
import { Image } from '../../image';
import { ShimmerText } from '../../shimmer-text';
import type {
  MessagePartDetailProps,
  MessagePartProcessProps,
  MessagePartReasoningProps,
  MessagePartSummaryProps,
  MessagePartTone,
  MessagePartToolGroupProps,
  MessagePartToolProps,
} from '../message-part.types';
import { MessagePartCollapsible } from './message-part-collapsible';
import { MessagePartStatus, MessagePartStatusDensityScope } from './message-part-status';

const SOURCE_LIST_DETAIL_SIZES = ['large'] as const;
const TOOL_DETAIL_SIZES = ['compact', 'large'] as const;
const toneClassName = {
  danger: 'text-error',
  default: 'text-foreground-tertiary',
  warning: 'text-warning',
} as const satisfies Record<MessagePartTone, string>;

export function MessagePartProcess({
  children,
  defaultExpanded = false,
  onDisclosureToggle,
  state,
  statusText,
  statusTone = 'default',
  testID = 'process',
  title,
}: MessagePartProcessProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const isRunning = state === 'running';
  const colorClassName = toneClassName[statusTone];
  const toggle = () => {
    onDisclosureToggle?.();
    setIsOpen((open) => !open);
  };

  return (
    <View className={`gap-3 border-border-subtle border-b ${isOpen ? 'pb-4' : ''}`}>
      <MessagePartStatus
        accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
        expanded={isOpen}
        onPress={toggle}
        testID={`${testID}-trigger`}
      >
        <View className="min-w-0 shrink flex-row items-center gap-1">
          <View className="min-w-0 shrink">
            {isRunning ? (
              <ShimmerText className="text-sm" numberOfLines={1}>
                {title}
              </ShimmerText>
            ) : (
              <Text className={`${colorClassName} text-sm`} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
          <DisclosureChevron
            expanded={isOpen}
            className="size-3 shrink-0 text-foreground-tertiary"
          />
        </View>
        {statusText ? (
          <Text className={`ml-auto max-w-[50%] shrink-0 text-xs ${colorClassName}`}>
            {statusText}
          </Text>
        ) : null}
      </MessagePartStatus>
      <MessagePartCollapsible className="gap-1" isOpen={isOpen} testID={`${testID}-detail`}>
        <MessagePartStatusDensityScope density="compact">{children}</MessagePartStatusDensityScope>
      </MessagePartCollapsible>
    </View>
  );
}

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
      <MessagePartSummary
        onPress={() => setIsOpen(true)}
        state={state}
        testID={testID}
        title={statusText}
      />
      {isOpen ? (
        <MessagePartDetail
          onClose={() => setIsOpen(false)}
          testID={`${testID}-detail`}
          title={detailTitle ?? statusText}
        >
          {children}
        </MessagePartDetail>
      ) : null}
    </View>
  );
}

export function MessagePartToolGroup({
  children,
  expanded,
  onDisclosureToggle,
  onExpandedChange,
  state,
  statusText,
  statusTone = 'default',
  testID = 'tool-group',
  title,
}: MessagePartToolGroupProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const isRunning = state === 'running';
  const isOpen = expanded ?? localOpen;
  const colorClassName = toneClassName[statusTone];
  const toggle = () => {
    onDisclosureToggle?.();
    if (expanded === undefined) setLocalOpen(!isOpen);
    onExpandedChange?.(!isOpen);
  };

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
        expanded={isOpen}
        onPress={toggle}
        testID={`${testID}-trigger`}
      >
        <View className="min-w-0 shrink">
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
        <DisclosureChevron expanded={isOpen} className="size-3 shrink-0 text-foreground-tertiary" />
        <View className="flex-1" />
        {statusText ? (
          <Text className={`max-w-[50%] shrink-0 text-xs ${colorClassName}`}>{statusText}</Text>
        ) : null}
      </MessagePartStatus>
      <MessagePartCollapsible className="gap-1" isOpen={isOpen} testID={`${testID}-steps`}>
        {children}
      </MessagePartCollapsible>
    </View>
  );
}

export function MessagePartTool({
  children,
  detailTitle,
  detailVariant = 'default',
  icon,
  state,
  statusText,
  statusTone = 'default',
  testID = 'tool-part',
  title,
  titleAnimation,
}: MessagePartToolProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="gap-1.5">
      <MessagePartSummary
        icon={icon}
        onPress={() => setIsOpen(true)}
        state={state}
        statusText={statusText}
        statusTone={statusTone}
        testID={testID}
        title={title}
        titleAnimation={titleAnimation}
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
  icon: Icon,
  imageSource,
  onPress,
  state,
  statusText,
  statusTone = 'default',
  testID = 'message-part-summary',
  title,
  titleAnimation = 'shimmer',
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
      ) : Icon ? (
        <Icon className={`size-4 ${colorClassName}`} />
      ) : null}
      <View className="min-w-0 shrink">
        {isRunning && titleAnimation === 'shimmer' ? (
          <ShimmerText className="text-sm" numberOfLines={1} testID={`${testID}-running-title`}>
            {title}
          </ShimmerText>
        ) : (
          <Text className={`text-sm ${colorClassName}`} numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      <ChevronRightIcon className="size-3 shrink-0 text-foreground-tertiary" />
      <View className="flex-1" />
      {statusText ? (
        <Text className={`max-w-[38%] shrink-0 text-xs ${colorClassName}`} numberOfLines={1}>
          {statusText}
        </Text>
      ) : null}
    </MessagePartStatus>
  );
}

export function MessagePartDetail({
  children,
  footer,
  headerAction,
  onClose,
  sizes,
  testID,
  title,
  variant = 'default',
}: MessagePartDetailProps) {
  // Content composes shared sections or specialized source/media renderers inside this one shell.
  const heightProps = sizes ? { sizes } : ({ size: 'large' } as const);

  return (
    <BottomSheet
      {...heightProps}
      headerAction={headerAction}
      footer={footer}
      onClose={onClose}
      open
      testID={testID}
      title={title}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName={
          variant === 'source-list' ? 'gap-2.5 px-3 pb-4' : 'gap-6 px-5 pt-2 pb-6'
        }
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </BottomSheet>
  );
}
