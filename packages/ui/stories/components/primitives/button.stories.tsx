import { Button, type ButtonProps, type ButtonVariant } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import { PlusIcon } from 'lucide-uniwind/png';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

const variants: ButtonVariant[] = ['default', 'destructive', 'outline', 'secondary', 'ghost'];

type ThemePreviewProps = {
  args: ButtonProps;
  label: string;
  theme: (typeof themes)[number]['value'];
};

function ThemePreview({ args, label, theme }: ThemePreviewProps) {
  return (
    <ScopedTheme theme={theme}>
      <View className="gap-4 border border-border bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>
        {variants.map((variant) => (
          <View className="items-start gap-3" key={variant}>
            <Text className="text-sm font-medium capitalize text-muted-foreground">{variant}</Text>
            <Button
              {...args}
              disabled={false}
              icon={<PlusIcon />}
              loading={false}
              variant={variant}
            >
              Label
            </Button>
            <Button
              {...args}
              accessibilityLabel={`Add (${variant})`}
              disabled={false}
              icon={<PlusIcon />}
              loading={false}
              variant={variant}
            >
              {null}
            </Button>
            <Button {...args} disabled loading={false} variant={variant}>
              Disabled
            </Button>
            <Button {...args} disabled={false} loading variant={variant}>
              Loading
            </Button>
          </View>
        ))}
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Button',
  component: Button,
  args: {
    children: 'Continue',
    disabled: false,
    loading: false,
    onPress: fn(),
    variant: 'default',
  },
  argTypes: {
    children: { control: 'text' },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    variant: { control: 'select', options: variants },
  },
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4 p-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Story />
      </ScrollView>
    ),
  ],
  render: (args) => <Button {...args} />,
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview args={args} key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
