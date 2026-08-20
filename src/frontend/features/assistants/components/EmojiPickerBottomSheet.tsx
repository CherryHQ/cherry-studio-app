import { BottomSheet, useBottomSheet } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmojiPicker, type EmojiSelection } from 'rn-expo-emoji-picker/legend';

// Fraction of the available height the emoji sheet fills (matches the model
// picker) so the grid has room to scroll.
const emojiSheetSnapPointFraction = 0.85;

type EmojiPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPickerBottomSheet({ isOpen, onClose, onSelect }: EmojiPickerBottomSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * emojiSheetSnapPointFraction;

  return (
    <BottomSheet open={isOpen ?? true}>
      <BottomSheet.Content height={sheetHeight} onClose={() => onClose?.()} testID="emoji-picker">
        <BottomSheet.Header>
          <BottomSheet.CloseButton accessibilityLabel={t('common.close')} />
          <BottomSheet.Title>{t('assistant.emoji.title')}</BottomSheet.Title>
          <BottomSheet.HeaderSpacer />
        </BottomSheet.Header>
        <BottomSheet.Body>
          <EmojiPickerSheetBody onSelect={onSelect} />
        </BottomSheet.Body>
      </BottomSheet.Content>
    </BottomSheet>
  );
}

function EmojiPickerSheetBody({ onSelect }: { onSelect: (emoji: string) => void }) {
  const { requestClose } = useBottomSheet();
  // Selecting an emoji closes the sheet itself (the owner only updates its form).
  const handleSelect = (selection: EmojiSelection) => {
    onSelect(selection.emoji);
    requestClose();
  };

  return (
    // The card bounds the height and the picker is `flex:1`, so it fills the
    // body. No `ScrollComponent` is passed: @swmansion's native scroll
    // negotiation drives the list's scroll-vs-dismiss handoff, so the picker's
    // default LegendList works as-is (that prop only exists for JS sheets like
    // @gorhom that share a gesture context).
    //
    // The picker paints its theme `background` (opaque #FFFFFF/#1C1C1E) by
    // default, which would cover the sheet's liquid-glass surface; override it
    // to transparent so the glass shows through like the other sheets.
    <EmojiPicker
      enableSearch={false}
      enableSkinToneSelector={false}
      onEmojiSelected={handleSelect}
      style={styles.picker}
      theme={emojiPickerTheme}
    />
  );
}

const emojiPickerTheme = { colors: { background: 'transparent' } };

const styles = StyleSheet.create({
  picker: {
    flex: 1,
  },
});
