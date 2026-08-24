import BellIcon from '@cherrystudio/app-icons/icons/bell';
import CircleUserRoundIcon from '@cherrystudio/app-icons/icons/circle-user-round';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import { Button, Section, Switch } from '@cherrystudio/ui/components';
import type { Meta, StoryObj } from '@storybook/react-native';
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

        <Section>
          <Section.Header title="General" />
          <Section.Item
            label="Appearance"
            leading={<PaletteIcon className="size-5 text-primary" />}
            onPress={fn()}
          />
          <Section.Item
            label="Account"
            leading={<CircleUserRoundIcon className="size-5 text-primary" />}
            onPress={fn()}
          />
          <Section.Item
            label="Notifications"
            leading={<BellIcon className="size-5 text-primary" />}
            trailing={
              <Switch
                accessibilityLabel="Notifications"
                onValueChange={setNotificationsEnabled}
                value={notificationsEnabled}
              />
            }
          />
        </Section>

        <Section footer="Version information is read-only.">
          <Section.Header title="About">
            <Button size="sm" variant="ghost">
              View all
            </Button>
          </Section.Header>
          <Section.Item
            description="Build 2026.08.05"
            label="Cherry Studio"
            leading={<InfoIcon className="size-5 text-primary" />}
            trailing={<Text className="text-base text-muted-foreground">0.2</Text>}
          />
          <Section.Item disabled label="Unavailable option" onPress={fn()} />
        </Section>

        <Section>
          <Section.Item
            destructive
            label="Delete account"
            leading={<Trash2Icon className="size-5 text-destructive" />}
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
