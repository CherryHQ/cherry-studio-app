import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import ListChecksIcon from '@cherrystudio/app-icons/icons/list-checks';
import WrenchIcon from '@cherrystudio/app-icons/icons/wrench';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

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
import { MessagePartStatus } from './message-part-status';

const SOURCE_LIST_DETAIL_SIZES = ['large'] as const;
const TOOL_DETAIL_SIZES = ['compact', 'large'] as const;

const toneClassName = {
  danger: 'text-destructive',
  default: 'text-muted-foreground',
  warning: 'text-warning',
} as const satisfies Record<MessagePartTone, string>;

export function MessagePartReasoning({
  children,
  state,
  statusText,
  testID = 'reasoning',
}: MessagePartReasoningProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = state === 'running';
  const ChevronIcon = isOpen ? ChevronDownIcon : ChevronRightIcon;

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText}
        onPress={() => setIsOpen((open) => !open)}
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
        <ChevronIcon className="size-3.5 text-muted-foreground" />
      </MessagePartStatus>
      {isOpen ? (
        <View className="border-border border-l-2 pl-3" testID={`${testID}-detail`}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function MessagePartToolGroup({
  children,
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
  const ChevronIcon = isOpen ? ChevronDownIcon : ChevronRightIcon;

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
        onPress={() => setManualOpen(!isOpen)}
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
        <ChevronIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </MessagePartStatus>
      {isOpen ? (
        <View className="gap-1" testID={`${testID}-steps`}>
          {children}
        </View>
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
