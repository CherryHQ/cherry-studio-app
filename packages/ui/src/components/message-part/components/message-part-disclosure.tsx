import { ChevronRightIcon, WrenchIcon } from '@cherrystudio/app-icons';
import type { Detent } from '@swmansion/react-native-bottom-sheet';
import { type ReactNode, useMemo, useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '../../bottom-sheet';
import { Image } from '../../image';
import { PrismSweep } from '../../loading';
import type {
  MessagePartReasoningProps,
  MessagePartTone,
  MessagePartToolProps,
} from '../message-part.types';
import { MessagePartStatus } from './message-part-status';

const sheetMediumFraction = 0.6;
const sheetFullFraction = 0.94;

const toneClassName = {
  danger: 'text-destructive',
  default: 'text-foreground',
  warning: 'text-warning',
} as const satisfies Record<MessagePartTone, string>;

export function MessagePartReasoning({
  children,
  closeAccessibilityLabel,
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
          closeAccessibilityLabel={closeAccessibilityLabel}
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
  closeAccessibilityLabel,
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

  return (
    <View className="gap-1.5">
      <MessagePartStatus
        accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
        onPress={() => setIsOpen(true)}
        testID={`${testID}-trigger`}
      >
        {state === 'running' ? (
          <ActivityIndicator size="small" />
        ) : imageSource ? (
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
      {isOpen ? (
        <MessagePartSheet
          closeAccessibilityLabel={closeAccessibilityLabel}
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

function MessagePartSheet({
  children,
  closeAccessibilityLabel,
  contentClassName,
  onClose,
  testID,
  title,
}: {
  children: ReactNode;
  closeAccessibilityLabel: string;
  contentClassName: string;
  onClose: () => void;
  testID: string;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const detents = useMemo<Detent[]>(
    () => [0, availableHeight * sheetMediumFraction, 'content'],
    [availableHeight],
  );

  return (
    <BottomSheet defaultOpen>
      <BottomSheet.Content
        detents={detents}
        height={availableHeight * sheetFullFraction}
        onClose={onClose}
        testID={testID}
      >
        <BottomSheet.Header>
          <BottomSheet.CloseButton accessibilityLabel={closeAccessibilityLabel} />
          <BottomSheet.Title>{title}</BottomSheet.Title>
          <BottomSheet.HeaderSpacer />
        </BottomSheet.Header>
        <BottomSheet.ScrollView
          className="flex-1"
          contentContainerClassName={contentClassName}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </BottomSheet.ScrollView>
      </BottomSheet.Content>
    </BottomSheet>
  );
}
