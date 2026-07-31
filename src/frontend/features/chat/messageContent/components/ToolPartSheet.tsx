import type { Detent } from '@swmansion/react-native-bottom-sheet';
import type { ImageSource } from 'expo-image';
import { ChevronRightIcon, type PngIconProps, WrenchIcon } from 'lucide-uniwind/png';
import { type ComponentType, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '@/frontend/components/bottomSheet';
import { Image } from '@/frontend/components/nativePrimitives';

const toolSheetMediumFraction = 0.6;
const toolSheetFullFraction = 0.94;

type ToolPartTriggerProps = {
  icon?: ComponentType<PngIconProps>;
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
  const isDanger = statusTone === 'danger';
  const isWarning = statusTone === 'warning';

  return (
    <Pressable
      accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
      accessibilityRole="button"
      className="flex-row items-center gap-2 py-0.5 active:opacity-60"
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
        <Icon
          className={
            isDanger
              ? 'size-4 text-danger'
              : isWarning
                ? 'size-4 text-warning'
                : 'size-4 text-default-foreground'
          }
          strokeWidth={2}
        />
      )}
      <Text
        className={
          isDanger
            ? 'min-w-0 flex-1 text-danger text-sm'
            : isWarning
              ? 'min-w-0 flex-1 text-warning text-sm'
              : 'min-w-0 flex-1 text-default-foreground text-sm'
        }
        numberOfLines={1}
      >
        {title}
      </Text>
      {statusText ? (
        <Text
          className={
            isDanger
              ? 'max-w-[38%] shrink-0 text-danger text-sm'
              : isWarning
                ? 'max-w-[38%] shrink-0 text-warning text-sm'
                : 'max-w-[38%] shrink-0 text-default-foreground text-sm'
          }
          numberOfLines={1}
        >
          {statusText}
        </Text>
      ) : null}
      <ChevronRightIcon
        className={
          isDanger
            ? 'size-4 shrink-0 text-danger'
            : isWarning
              ? 'size-4 shrink-0 text-warning'
              : 'size-4 shrink-0 text-default-foreground'
        }
        strokeWidth={2}
      />
    </Pressable>
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
    <BottomSheet
      closeAccessibilityLabel={t('common.close')}
      detents={detents}
      height={fullHeight}
      onClose={onClose}
      testID={testID}
      title={title}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-2.5 px-4 pb-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2.5">{children}</View>
      </ScrollView>
    </BottomSheet>
  );
}
