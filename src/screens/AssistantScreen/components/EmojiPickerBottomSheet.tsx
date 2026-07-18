import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { EmojiPicker, type EmojiSelection } from 'rn-expo-emoji-picker/legend';
import { SelectionBottomSheet } from '@/components/selectionSheet';

// Detent indices for the underlying `SelectionBottomSheet`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

type EmojiPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPickerBottomSheet({ isOpen, onClose, onSelect }: EmojiPickerBottomSheetProps) {
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Mirror the declarative `isOpen` prop into the sheet's detent index during
  // render (same pattern as `ModelPickerBottomSheet`).
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  const handleSelect = (selection: EmojiSelection) => {
    onSelect(selection.emoji);
    setSheetIndex(CLOSED_INDEX);
  };

  return (
    <SelectionBottomSheet
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          onClose?.();
        }
      }}
    >
      {/* The sheet viewport already bounds the height and the picker is `flex:1`,
          so it fills the sheet. No `ScrollComponent` is passed: @swmansion's
          native scroll negotiation drives the list's scroll-vs-dismiss handoff,
          so the picker's default LegendList scroll view works as-is (that prop
          only exists for JS sheets like @gorhom that share a gesture context).

          The picker paints its theme `background` (opaque #FFFFFF/#1C1C1E) by
          default, which would cover the sheet's liquid-glass surface; override
          it to transparent so the glass shows through like the other sheets. */}
      <EmojiPicker
        enableSearch={false}
        enableSkinToneSelector={false}
        onEmojiSelected={handleSelect}
        style={styles.picker}
        theme={emojiPickerTheme}
      />
    </SelectionBottomSheet>
  );
}

const emojiPickerTheme = { colors: { background: 'transparent' } };

const styles = StyleSheet.create({
  picker: {
    flex: 1,
  },
});
