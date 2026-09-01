import {
  Button,
  OptionPickerBottomSheet,
  type OptionPickerBottomSheetProps,
} from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { fn } from 'storybook/test';

type Language = 'en-US' | 'system' | 'zh-CN';

const languageOptions = [
  { description: 'Follow the device language.', label: 'System', value: 'system' },
  { label: 'English', value: 'en-US' },
  { label: '简体中文', value: 'zh-CN' },
] as const;

function OptionPickerPreview(args: OptionPickerBottomSheetProps<Language>) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(args.selectedValue);
  const label = languageOptions.find((option) => option.value === language)?.label;

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
      <Text className="text-base text-foreground">Selected: {label}</Text>
      <Button onPress={() => setIsOpen(true)}>Choose language</Button>
      <OptionPickerBottomSheet
        {...args}
        onClose={() => setIsOpen(false)}
        onValueChange={setLanguage}
        open={isOpen}
        selectedValue={language}
      />
    </View>
  );
}

const meta = {
  title: 'Components/Primitives/Option Picker Bottom Sheet',
  component: OptionPickerBottomSheet,
  args: {
    onClose: fn(),
    onValueChange: fn(),
    open: false,
    options: languageOptions,
    selectedValue: 'system',
    size: 'compact',
    title: 'Language',
  },
} satisfies Meta<OptionPickerBottomSheetProps<Language>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <OptionPickerPreview {...args} />,
};
