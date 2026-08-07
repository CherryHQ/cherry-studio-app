import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FoundationPage, formatTokenValue, Group, SpecRow, ThemeSplit } from './showcase';

type TypeStep = { className: string; name: string; role: string; sample: string };

const LONG = '设计令牌 Design tokens 0123';
const SHORT = '设计令牌 Ag';
const GLYPHS = 'Ag';

/**
 * The ladder itself lives in `src/frontend/utils/typographyScale.ts` — these
 * rows only name the Tailwind utility each step backs. Sizes shown are read
 * from `--ui-text-*` at runtime, so an accessibility step shift is visible here
 * too rather than being documented as a fixed number.
 */
const TYPE_SCALE: TypeStep[] = [
  { className: 'text-xs', name: 'xs', role: 'vbg label / metadata', sample: LONG },
  { className: 'text-sm', name: 'sm', role: 'vbg compact', sample: LONG },
  { className: 'text-base', name: 'base', role: 'vbg body', sample: LONG },
  { className: 'text-lg', name: 'lg', role: 'vbg lede', sample: LONG },
  { className: 'text-xl', name: 'xl', role: 'vbg subsection', sample: LONG },
  { className: 'text-2xl', name: '2xl', role: 'vbg section', sample: SHORT },
  { className: 'text-3xl', name: '3xl', role: 'vbg title', sample: SHORT },
  { className: 'text-4xl', name: '4xl', role: 'vbg page-title', sample: SHORT },
  { className: 'text-5xl', name: '5xl', role: 'vbg display', sample: GLYPHS },
  { className: 'text-6xl', name: '6xl', role: 'VBG 无对应角色，沿用旧值', sample: GLYPHS },
  { className: 'text-7xl', name: '7xl', role: 'VBG 无对应角色，沿用旧值', sample: GLYPHS },
  { className: 'text-8xl', name: '8xl', role: 'VBG 无对应角色，沿用旧值', sample: GLYPHS },
  { className: 'text-9xl', name: '9xl', role: 'VBG 无对应角色，沿用旧值', sample: GLYPHS },
];

const SIZE_VARIABLES = TYPE_SCALE.flatMap(({ name }) => [
  `--ui-text-${name}`,
  `--ui-text-${name}--line-height`,
]);

const WEIGHTS = [
  { className: 'font-normal', label: 'font-normal', note: 'VBG 400 — 正文' },
  { className: 'font-medium', label: 'font-medium', note: 'VBG 500 — 强调、按钮' },
  { className: 'font-semibold', label: 'font-semibold', note: 'VBG 600 — 标题' },
  { className: 'font-bold', label: 'font-bold', note: '已由 700 重映射到 600（VBG 最重档）' },
];

const WEIGHT_VARIABLES = ['--font-weight-regular', '--font-weight-medium', '--font-weight-bold'];

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
  const values = useCSSVariable(WEIGHT_VARIABLES);

  return (
    <View className="gap-5">
      <View className="gap-3">
        {WEIGHTS.map(({ className, label, note }) => (
          <View className="gap-1" key={label}>
            <Text className={`text-xl text-foreground ${className}`}>{SHORT}</Text>
            <Text className="text-xs text-muted-foreground">{`${label} · ${note}`}</Text>
          </View>
        ))}
      </View>

      <Group
        hint="契约里只有这三档驱动工具类。VBG 的 450 需要可变字体，而正文走系统字体的 RN fontWeight，没有 450，故丢弃。"
        title="字重契约"
      >
        <View className="gap-2">
          {WEIGHT_VARIABLES.map((variable, index) => (
            <SpecRow key={variable} name={variable} value={formatTokenValue(values[index])} />
          ))}
        </View>
      </Group>
    </View>
  );
}

function MonoRows() {
  const family = useCSSVariable('--font-mono');

  return (
    <View className="gap-4">
      <View className="gap-2 rounded-lg bg-[var(--code-block)] p-3">
        <Text className="font-mono text-sm text-foreground">
          {'const scale = resolveTypographyScale(0);'}
        </Text>
        <Text className="font-mono text-sm text-foreground">{'// 0123456789 Il1 O0 -> =>'}</Text>
      </View>

      <SpecRow name="--font-mono" value={formatTokenValue(family)} />

      <Text className="text-xs text-muted-foreground">
        {'字体本体由 app.json 的 expo-font 插件在构建期嵌入原生工程。上面这行显示了字体名，但只有 ' +
          'prebuild + 重新编译之后字形才会真的变成 Geist Mono —— 名字对而字形还是系统等宽，就说明原生没重编。'}
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
      <Group title="字重">
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
