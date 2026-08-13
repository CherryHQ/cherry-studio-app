import { ChevronLeftIcon, XIcon } from '@cherrystudio/app-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Surface } from '../surface';
import { bottomSheetLayout } from './bottom-sheet.layout';
import type { BottomSheetCloseReason } from './bottom-sheet.types';

type BottomSheetHeaderProps = {
  backAccessibilityLabel?: string;
  closeAccessibilityLabel?: string;
  headerRight?: ReactNode;
  isDisabled: boolean;
  onBack?: () => void;
  onRequestClose: (reason?: BottomSheetCloseReason) => void;
  testID?: string;
  title?: ReactNode;
};

export function BottomSheetHeader({
  backAccessibilityLabel,
  closeAccessibilityLabel,
  headerRight,
  isDisabled,
  onBack,
  onRequestClose,
  testID,
  title,
}: BottomSheetHeaderProps) {
  const closeControl = (
    <BottomSheetHeaderControl
      isInteractive={!isDisabled}
      testID={testID ? `${testID}-close-surface` : undefined}
    >
      <BottomSheetCloseButton
        disabled={isDisabled}
        label={closeAccessibilityLabel}
        onPress={() => onRequestClose('dismiss')}
        testID={testID ? `${testID}-close` : undefined}
      />
    </BottomSheetHeaderControl>
  );
  const backControl = onBack ? (
    <BottomSheetHeaderControl
      isInteractive={!isDisabled}
      testID={testID ? `${testID}-back-surface` : undefined}
    >
      <BottomSheetBackButton
        disabled={isDisabled}
        label={backAccessibilityLabel}
        onPress={onBack}
        testID={testID ? `${testID}-back` : undefined}
      />
    </BottomSheetHeaderControl>
  ) : null;

  return (
    <View
      className="flex-row"
      style={styles.header}
      testID={testID ? `${testID}-header` : undefined}
    >
      {backControl ?? closeControl}
      {typeof title === 'string' ? (
        <Text
          className="flex-1 px-3 text-center font-semibold text-foreground text-base"
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : (
        title
      )}
      {onBack ? closeControl : (headerRight ?? <View style={styles.headerSide} />)}
    </View>
  );
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

function BottomSheetBackButton({
  disabled,
  label,
  onPress,
  testID,
}: {
  disabled: boolean;
  label?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      <ChevronLeftIcon className="size-6 text-foreground" />
    </Pressable>
  );
}

function BottomSheetCloseButton({
  disabled,
  label,
  onPress,
  testID,
}: {
  disabled: boolean;
  label?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-full w-full items-center justify-center rounded-full active:opacity-60 disabled:opacity-40"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      testID={testID}
    >
      <XIcon className="size-6 text-foreground" />
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
