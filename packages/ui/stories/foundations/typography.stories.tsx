import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FoundationPage, formatTokenValue, Group, SpecRow, ThemeSplit } from './showcase';
import { MONO_VARIABLE, SIZE_VARIABLES, TYPE_SCALE, WEIGHT_SAMPLE, WEIGHTS } from './tokens';

function TypeScaleRows() {
  const values = useCSSVariable(SIZE_VARIABLES);

  return (
    <View className="gap-5">
      {TYPE_SCALE.map(({ className, name, role, sample }, index) => (
        <View className="gap-1" key={name}>
          <Text className={`${className} text-foreground`}>{sample}</Text>
          <Text className="text-xs text-muted-foreground">
            {`text-${name} · ${formatTokenValue(values[index * 2])} / ${formatTokenValue(
              values[index * 2 + 1],
            )} · ${role}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeightRows() {
  return (
    <View className="gap-3">
      {WEIGHTS.map(({ className, label, note }) => (
        <View className="gap-1" key={label}>
          <Text className={`text-xl text-foreground ${className}`}>{WEIGHT_SAMPLE}</Text>
          <Text className="text-xs text-muted-foreground">{`${label} · ${note}`}</Text>
        </View>
      ))}
    </View>
  );
}

function MonoRows() {
  const family = useCSSVariable(MONO_VARIABLE);

  return (
    <View className="gap-4">
      <View className="gap-2 rounded-lg bg-[var(--code-block)] p-3">
        <Text className="font-mono text-sm text-foreground">
          {'const scale = resolveTypographyScale(0);'}
        </Text>
        <Text className="font-mono text-sm text-foreground">{'// 0123456789 Il1 O0 -> =>'}</Text>
      </View>

      <SpecRow name={MONO_VARIABLE} value={formatTokenValue(family)} />

      <Text className="text-xs text-muted-foreground">
        {'字体本体由 app.json 的 expo-font 插件在构建期嵌入原生工程。判断它有没有真的生效，看字宽是否等宽：' +
          'iOS 上没注册成功的 fontFamily 会回落到比例字体 San Francisco，而不是别的等宽字体。'}
      </Text>
    </View>
  );
}

const meta = {
  title: 'Foundations/Typography',
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

export const TypeScale: Story = {
  render: () => (
    <ThemeSplit>
      <Group
        hint="前九档逐字采用 VBG 的 size/leading 配对。第十档起 VBG 没有对应角色，沿用原有的 1:1 行高。"
        title="字号阶梯"
      >
        <TypeScaleRows />
      </Group>
    </ThemeSplit>
  ),
};

export const Weights: Story = {
  render: () => (
    <ThemeSplit>
      <Group
        hint="契约里只有 400/500/600 三档驱动工具类。VBG 的 450 需要可变字体，而正文走系统字体的 RN fontWeight，没有 450，故丢弃。"
        title="字重"
      >
        <WeightRows />
      </Group>
    </ThemeSplit>
  ),
};

export const Mono: Story = {
  render: () => (
    <ThemeSplit>
      <Group
        hint="正文保持系统字体：Geist 没有中文字形。只有等宽字体换成 Geist Mono。"
        title="等宽字体"
      >
        <MonoRows />
      </Group>
    </ThemeSplit>
  ),
};
