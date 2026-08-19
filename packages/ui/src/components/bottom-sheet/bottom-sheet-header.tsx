import { ChevronLeftIcon, XIcon } from '@cherrystudio/app-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cn } from '../../utils';
import { Surface } from '../surface';
import { useBottomSheet } from './bottom-sheet.context';
import { bottomSheetLayout } from './bottom-sheet.layout';
import type {
  BottomSheetBackButtonProps,
  BottomSheetCloseButtonProps,
  BottomSheetHeaderProps,
  BottomSheetTitleProps,
} from './bottom-sheet.types';

export function BottomSheetHeader({
  children,
  className,
  style,
  testID,
  ...props
}: BottomSheetHeaderProps) {
  const sheet = useBottomSheet();

  return (
    <View
      {...props}
      className={cn('flex-row', className)}
      style={[styles.header, style]}
      testID={testID ?? (sheet.testID ? `${sheet.testID}-header` : undefined)}
    >
      {children}
    </View>
  );
}

export function BottomSheetTitle({ children, className, ...props }: BottomSheetTitleProps) {
  return (
    <Text
      {...props}
      className={cn('flex-1 px-3 text-center font-semibold text-foreground text-base', className)}
      numberOfLines={props.numberOfLines ?? 1}
    >
      {children}
    </Text>
  );
}

export function BottomSheetBackButton({
  accessibilityLabel,
  disabled,
  onPress,
  testID,
  ...props
}: BottomSheetBackButtonProps) {
  const sheet = useBottomSheet();
  const isDisabled = disabled || sheet.isCloseDisabled;

  return (
    <BottomSheetHeaderControl
      isInteractive={!isDisabled}
      testID={
        testID ? `${testID}-surface` : sheet.testID ? `${sheet.testID}-back-surface` : undefined
      }
    >
      <BottomSheetIconButton
        {...props}
        accessibilityLabel={accessibilityLabel}
        disabled={isDisabled}
        onPress={onPress}
        testID={testID ?? (sheet.testID ? `${sheet.testID}-back` : undefined)}
      >
        <ChevronLeftIcon className="size-6 text-foreground" />
      </BottomSheetIconButton>
    </BottomSheetHeaderControl>
  );
}

export function BottomSheetCloseButton({
  accessibilityLabel,
  disabled,
  testID,
  ...props
}: BottomSheetCloseButtonProps) {
  const sheet = useBottomSheet();
  const isDisabled = disabled || sheet.isCloseDisabled;

  return (
    <BottomSheetHeaderControl
      isInteractive={!isDisabled}
      testID={
        testID ? `${testID}-surface` : sheet.testID ? `${sheet.testID}-close-surface` : undefined
      }
    >
      <BottomSheetIconButton
        {...props}
        accessibilityLabel={accessibilityLabel}
        disabled={isDisabled}
        onPress={() => sheet.requestClose('dismiss')}
        testID={testID ?? (sheet.testID ? `${sheet.testID}-close` : undefined)}
      >
        <XIcon className="size-6 text-foreground" />
      </BottomSheetIconButton>
    </BottomSheetHeaderControl>
  );
}

export function BottomSheetHeaderSpacer() {
  return <View style={styles.headerSide} />;
}

function BottomSheetHeaderControl({
  children,
  isInteractive,
  testID,
}: {
  children: ReactNode;
  isInteractive: boolean;
  testID?: string;
}) {
  return (
    <Surface
      className="bg-secondary"
      cornerRadius={bottomSheetLayout.headerControlSize / 2}
      interactive={isInteractive}
      style={styles.controlSurface}
      testID={testID}
    >
      {children}
    </Surface>
  );
}

function BottomSheetIconButton({ children, ...props }: ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      hitSlop={props.hitSlop ?? 8}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controlSurface: {
    borderCurve: 'continuous',
    height: bottomSheetLayout.headerControlSize,
    width: bottomSheetLayout.headerControlSize,
  },
  header: {
    alignItems: 'center',
    height: bottomSheetLayout.headerHeight,
    paddingHorizontal: bottomSheetLayout.headerHorizontalInset,
  },
  headerSide: {
    height: bottomSheetLayout.headerControlSize,
    width: bottomSheetLayout.headerControlSize,
  },
});
