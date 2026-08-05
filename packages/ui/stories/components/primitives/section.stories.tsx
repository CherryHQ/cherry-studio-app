import { Section, Switch } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
import {
  BellIcon,
  CircleUserRoundIcon,
  InfoIcon,
  PaletteIcon,
  Trash2Icon,
} from 'lucide-uniwind/png';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import { ScopedTheme } from 'uniwind';

const themes = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

function ThemePreview({ label, theme }: { label: string; theme: 'dark' | 'light' }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <ScopedTheme theme={theme}>
      <View className="gap-6 bg-background p-4">
        <Text className="text-lg font-semibold text-foreground">{label}</Text>

        <Section title="General">
          <Section.Item
            label="Appearance"
            leading={<PaletteIcon className="size-5 text-primary" strokeWidth={2} />}
            onPress={fn()}
          />
          <Section.Item
            label="Account"
            leading={<CircleUserRoundIcon className="size-5 text-primary" strokeWidth={2} />}
            onPress={fn()}
          />
          <Section.Item
            label="Notifications"
            leading={<BellIcon className="size-5 text-primary" strokeWidth={2} />}
            trailing={
              <Switch
                accessibilityLabel="Notifications"
                onValueChange={setNotificationsEnabled}
                value={notificationsEnabled}
              />
            }
          />
        </Section>

        <Section footer="Version information is read-only." title="About">
          <Section.Item
            description="Build 2026.08.05"
            label="Cherry Studio"
            leading={<InfoIcon className="size-5 text-primary" strokeWidth={2} />}
            trailing={<Text className="text-base text-muted-foreground">0.2</Text>}
          />
          <Section.Item disabled label="Unavailable option" onPress={fn()} />
        </Section>

        <Section>
          <Section.Item
            destructive
            label="Delete account"
            leading={<Trash2Icon className="size-5 text-danger" strokeWidth={2} />}
            onPress={fn()}
            showChevron={false}
          />
        </Section>
      </View>
    </ScopedTheme>
  );
}

const meta = {
  title: 'Components/Primitives/Section',
  component: Section,
  decorators: [
    (Story) => (
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow gap-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Story />
      </ScrollView>
    ),
  ],
} satisfies Meta<typeof Section>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <View className="gap-4">
      {themes.map((theme) => (
        <ThemePreview key={theme.value} label={theme.label} theme={theme.value} />
      ))}
    </View>
  ),
};
