import { ChevronRightIcon, type AppIconProps, WrenchIcon } from '@cherrystudio/app-icons';
import { BottomSheet, Image } from '@cherrystudio/ui/components';
import type { Detent } from '@swmansion/react-native-bottom-sheet';
import type { ImageSource } from 'expo-image';
import { type ComponentType, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageStatusRow } from '../../components/MessageStatusRow';

const toolSheetMediumFraction = 0.6;
const toolSheetFullFraction = 0.94;

// 三档语气只改颜色，布局类完全相同。展开成「每个位置一串完整 className」时，
// 调一次间距要同步改三份副本，而副本之间漂开是看不出来的。
const statusToneClassName = {
  danger: 'text-destructive',
  default: 'text-foreground',
  warning: 'text-warning',
} as const;

type ToolPartTriggerProps = {
  icon?: ComponentType<AppIconProps>;
  imageSource?: ImageSource | number;
  isRunning: boolean;
  onPress: () => void;
  statusText?: string;
  statusTone?: 'danger' | 'default' | 'warning';
  testID: string;
  title: string;
};

export function ToolPartTrigger({
  icon: Icon = WrenchIcon,
  imageSource,
  isRunning,
  onPress,
  statusText,
  statusTone = 'default',
  testID,
  title,
}: ToolPartTriggerProps) {
  const toneClassName = statusToneClassName[statusTone];

  return (
    <MessageStatusRow
      accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
      onPress={onPress}
      testID={testID}
    >
      {isRunning ? (
        <ActivityIndicator size="small" />
      ) : imageSource ? (
        <Image
          cachePolicy="memory-disk"
          className="size-5 shrink-0"
          contentFit="contain"
          source={imageSource}
        />
      ) : (
        <Icon className={`size-5 ${toneClassName}`} />
      )}
      <Text className={`min-w-0 flex-1 text-base ${toneClassName}`} numberOfLines={1}>
        {title}
      </Text>
      {statusText ? (
        <Text className={`max-w-[38%] shrink-0 text-base ${toneClassName}`} numberOfLines={1}>
          {statusText}
        </Text>
      ) : null}
      <ChevronRightIcon className={`size-4 shrink-0 ${toneClassName}`} />
    </MessageStatusRow>
  );
}

type ToolPartSheetProps = {
  children: ReactNode;
  onClose: () => void;
  testID: string;
  title: string;
};

export function ToolPartSheet({ children, onClose, testID, title }: ToolPartSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const fullHeight = availableHeight * toolSheetFullFraction;
  const detents = useMemo<Detent[]>(
    () => [0, availableHeight * toolSheetMediumFraction, 'content'],
    [availableHeight],
  );

  return (
    <BottomSheet defaultOpen>
      <BottomSheet.Content detents={detents} height={fullHeight} onClose={onClose} testID={testID}>
        <BottomSheet.Header>
          <BottomSheet.CloseButton accessibilityLabel={t('common.close')} />
          <BottomSheet.Title>{title}</BottomSheet.Title>
          <BottomSheet.HeaderSpacer />
        </BottomSheet.Header>
        <BottomSheet.ScrollView
          className="flex-1"
          contentContainerClassName="gap-2.5 px-4 pb-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2.5">{children}</View>
        </BottomSheet.ScrollView>
      </BottomSheet.Content>
    </BottomSheet>
  );
}
