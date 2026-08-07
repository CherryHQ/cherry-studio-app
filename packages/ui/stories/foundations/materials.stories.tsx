import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FoundationPage, formatTokenValue, Group, SpecRow, ThemeSplit } from './showcase';
import { BORDER_RAMP, RADIUS_STEPS, RADIUS_VARIABLE } from './tokens';

function RadiusRows() {
  const radius = useCSSVariable(RADIUS_VARIABLE);

  return (
    <View className="gap-4">
      <SpecRow name={RADIUS_VARIABLE} value={formatTokenValue(radius)} />
      <View className="gap-3">
        {RADIUS_STEPS.map(({ className, derivation }) => (
          <View className="flex-row items-center gap-3" key={className}>
            <View className={`h-12 w-20 bg-foreground ${className}`} />
            <Text className="flex-1 text-xs text-foreground">{className}</Text>
            <Text className="font-mono text-xs text-foreground-tertiary">{derivation}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ElevationStack() {
  return (
    <View className="gap-3">
      <View className="gap-2 rounded-xl bg-background-subtle p-4">
        <Text className="text-xs text-muted-foreground">bg-background-subtle</Text>
        <View className="gap-2 rounded-lg border border-border-subtle bg-card p-4">
          <Text className="text-xs text-muted-foreground">bg-card</Text>
          <View className="rounded-md border border-border bg-popover p-3">
            <Text className="text-xs text-muted-foreground">bg-popover</Text>
          </View>
        </View>
      </View>

      <View className="rounded-xl bg-grouped-surface p-4">
        <Text className="text-xs text-muted-foreground">bg-grouped-surface（分组列表卡片）</Text>
      </View>
    </View>
  );
}

function BorderRamp() {
  return (
    <View className="gap-4">
      <View className="gap-3">
        {BORDER_RAMP.map(({ className, name, usage }) => (
          <View className="gap-1.5" key={name}>
            <View className={`h-0.5 w-full ${className}`} />
            <Text className="text-xs text-muted-foreground">{`${name} · ${usage}`}</Text>
          </View>
        ))}
      </View>

      <View className="rounded-xl border border-border bg-card">
        {['第一行', '第二行', '第三行'].map((label, index) => (
          <View key={label}>
            {index > 0 ? <View className="h-px bg-border-subtle" /> : null}
            <Text className="p-4 text-base text-foreground">{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const meta = {
  title: 'Foundations/Materials',
  decorators: [
    (Story) => (
      <FoundationPage>
        <Story />
      </FoundationPage>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Radius: Story = {
  render: () => (
    <ThemeSplit>
      <Group hint="VBG 只有 6px 与 8px 两档，--radius 取 8px 并派生出整条阶梯。" title="圆角">
        <RadiusRows />
      </Group>
    </ThemeSplit>
  ),
};

/** The dark background is now VBG's literal pure black, so surface lift is worth eyeballing. */
export const Elevation: Story = {
  render: () => (
    <ThemeSplit>
      <Group
        hint="深色模式的 background 是纯黑，popover 因此被抬到 vbg gray-100 才有可见边界。"
        title="表面层叠"
      >
        <ElevationStack />
      </Group>
    </ThemeSplit>
  ),
};

export const Borders: Story = {
  render: () => (
    <ThemeSplit>
      <Group
        hint="全部来自 gray-alpha 叠加阶，跳过了非单调的 300/400 档，所以两个主题里层次都单调递增。"
        title="边框四级"
      >
        <BorderRamp />
      </Group>
    </ThemeSplit>
  ),
};
