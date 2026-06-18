import {
  BottomSheet,
  type BottomSheetMethods,
  BottomSheetView,
} from '@expo/ui/community/bottom-sheet';
import type { ReactNode, Ref } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const selectionSheetSnapPoints = ['85%'];
export const selectionSheetSnapPointFraction = 0.85;

export type SelectionBottomSheetRenderContext = {
  sheetHeight: number;
};

type SelectionBottomSheetProps = {
  bottomSheetRef?: Ref<BottomSheetMethods>;
  children: ReactNode | ((context: SelectionBottomSheetRenderContext) => ReactNode);
  isOpen?: boolean;
  onClose?: () => void;
};

export function SelectionBottomSheet({
  bottomSheetRef,
  children,
  isOpen,
  onClose,
}: SelectionBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * selectionSheetSnapPointFraction;
  const sheetIndex = isOpen === undefined ? -1 : isOpen ? 0 : -1;
  const content = typeof children === 'function' ? children({ sheetHeight }) : children;

  return (
    <BottomSheet
      enablePanDownToClose
      enableDynamicSizing={false}
      handleComponent={null}
      index={sheetIndex}
      ref={bottomSheetRef}
      snapPoints={selectionSheetSnapPoints}
      onClose={onClose}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>{content}</View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
  },
  sheetViewport: {
    flex: 1,
    overflow: 'hidden',
  },
});
