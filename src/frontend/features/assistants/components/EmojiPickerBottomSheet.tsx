import { BottomSheet } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { EmojiPicker, type EmojiSelection } from 'rn-expo-emoji-picker/legend';

type EmojiPickerBottomSheetProps = {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect: (emoji: string) => void;
};

export function EmojiPickerBottomSheet({ isOpen, onClose, onSelect }: EmojiPickerBottomSheetProps) {
  const { t } = useTranslation();
  const handleSelect = (selection: EmojiSelection) => {
    onSelect(selection.emoji);
    onClose?.();
  };

  return (
    <BottomSheet
      onClose={() => onClose?.()}
      open={isOpen ?? true}
      size="large"
      testID="emoji-picker"
      title={t('assistant.emoji.title')}
    >
      <EmojiPicker
        enableSearch={false}
        enableSkinToneSelector={false}
        onEmojiSelected={handleSelect}
        style={styles.picker}
        theme={emojiPickerTheme}
      />
    </BottomSheet>
  );
}

const emojiPickerTheme = { colors: { background: 'transparent' } };

const styles = StyleSheet.create({
  picker: {
    flex: 1,
  },
});
