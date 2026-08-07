import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FoundationPage, formatTokenValue, Group, SpecRow, ThemeSplit } from './showcase';

type PaletteScale = { hint: string; title: string; variables: string[] };
type SemanticGroup = { hint?: string; kind: SwatchKind; title: string; variables: string[] };
type SwatchKind = 'border' | 'surface' | 'text';

const neutralSteps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
/** Upstream ships five steps per hue: 100 tint, 400 border, 700 solid, 900 emphasis, 1000 text. */
const hueSteps = [100, 400, 700, 900, 1000];

const scale = (name: string, steps: number[]) => steps.map((step) => `--cs-vbg-${name}-${step}`);

const PALETTE_SCALES: PaletteScale[] = [
  {
    title: 'Backgrounds',
    hint: '页面底与次级面。深色档是 VBG 原值纯黑，不是抬灰过的黑。',
    variables: scale('background', [100, 200]),
  },
  {
    title: 'Gray',
    hint: '实色中性阶。400 比 300 更浅，是上游留给 hover 边框的专档；分级角色按实测亮度挑档，别按连号。',
    variables: scale('gray', neutralSteps),
  },
  {
    title: 'Gray alpha',
    hint: '叠加中性阶，衬在 background 上。四级边框走的是这一条（100/200/500/700，跳过非单调的 300/400）。',
    variables: scale('gray-alpha', neutralSteps),
  },
  { title: 'Blue', hint: 'info、reference', variables: scale('blue', hueSteps) },
  { title: 'Green', hint: 'success', variables: scale('green', hueSteps) },
  { title: 'Amber', hint: 'warning、highlight', variables: scale('amber', hueSteps) },
  { title: 'Red', hint: 'error、destructive、inline-code', variables: scale('red', hueSteps) },
];

const SEMANTIC_GROUPS: SemanticGroup[] = [
  {
    title: '表面',
    kind: 'surface',
    variables: [
      '--background',
      '--background-subtle',
      '--card',
      '--popover',
      '--sidebar',
      '--sidebar-accent',
    ],
  },
  {
    title: '文字',
    kind: 'text',
    variables: [
      '--foreground',
      '--muted-foreground',
      '--foreground-tertiary',
      '--foreground-disabled',
      '--link',
    ],
  },
  {
    title: '边框',
    hint: '四级层次，本次迁移改动最大的一组。subtle < 默认 < strong < selected 在两个主题里都单调。',
    kind: 'border',
    variables: [
      '--border-subtle',
      '--border',
      '--border-strong',
      '--border-selected',
      '--input',
      '--ring',
    ],
  },
  {
    title: '交互叠加',
    hint: '半透明叠加层，随下方表面变化。',
    kind: 'surface',
    variables: [
      '--secondary',
      '--secondary-hover',
      '--secondary-active',
      '--ghost-active',
      '--muted',
      '--destructive-hover',
    ],
  },
  {
    title: '品牌',
    hint: '唯一不来自 VBG 的一组：保留 Cherry 绿，并且仍可被设置页的主题色实时改写。',
    kind: 'surface',
    variables: ['--primary', '--primary-foreground'],
  },
  {
    title: '状态',
    hint: '每个 intent 的实色档位不同（error/info 用 700，success/warning 用 900），是上游为对比度做的调校。',
    kind: 'surface',
    variables: [
      '--error',
      '--error-border',
      '--success',
      '--success-border',
      '--warning',
      '--warning-border',
      '--info',
      '--info-border',
    ],
  },
  {
    title: '产品域',
    hint: '没有对应 Tailwind 工具类，用 bg-[var(--code-block)] 这样的任意值消费。',
    kind: 'surface',
    variables: [
      '--code-block',
      '--inline-code',
      '--reference',
      '--reference-subtle',
      '--highlight',
      '--highlight-accent',
      '--chat-user',
    ],
  },
  {
    title: '图表',
    hint: 'VBG 明确「分类系列默认单色」，所以这里是一条灰阶而不是彩虹。',
    kind: 'surface',
    variables: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'],
  },
];

const SURFACE_PAIRS: string[][] = [
  ['--background', '--foreground'],
  ['--card', '--card-foreground'],
  ['--popover', '--popover-foreground'],
  ['--primary', '--primary-foreground'],
  ['--secondary', '--secondary-foreground'],
  ['--muted', '--muted-foreground'],
  ['--destructive', '--destructive-foreground'],
  ['--sidebar', '--sidebar-foreground'],
  ['--error-subtle', '--error-subtle-foreground'],
  ['--warning-subtle', '--warning-subtle-foreground'],
  ['--success-subtle', '--success-subtle-foreground'],
  ['--info-subtle', '--info-subtle-foreground'],
  ['--inline-code', '--inline-code-foreground'],
  ['--reference', '--reference-foreground'],
  ['--highlight', '--highlight-foreground'],
];

const PAIR_VARIABLES = SURFACE_PAIRS.flat();

function Swatch({ kind, value }: { kind: SwatchKind; value: number | string | undefined }) {
  if (kind === 'text') {
    return (
      <View className="size-8 items-center justify-center rounded-md bg-background-subtle">
        <Text className="text-sm font-semibold" style={{ color: value as string }}>
          Aa
        </Text>
      </View>
    );
  }

  if (kind === 'border') {
    return (
      <View
        className="size-8 rounded-md border-2 bg-background-subtle"
        style={{ borderColor: value as string }}
      />
    );
  }

  return (
    <View
      className="size-8 rounded-md border border-border-subtle"
      style={{ backgroundColor: value as string }}
    />
  );
}

function PaletteScaleRow({ hint, title, variables }: PaletteScale) {
  const values = useCSSVariable(variables);

  return (
    <Group hint={hint} title={title}>
      <View className="flex-row overflow-hidden rounded-lg border border-border-subtle">
        {variables.map((variable, index) => (
          <View
            className="h-12 flex-1"
            key={variable}
            style={{ backgroundColor: values[index] as string }}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {variables.map((variable, index) => (
          <View
            className="w-1/2 flex-row items-center justify-between gap-2 py-0.5 pr-3"
            key={variable}
          >
            <Text className="text-xs text-muted-foreground">
              {variable.slice(variable.lastIndexOf('-') + 1)}
            </Text>
            <Text className="font-mono text-xs text-foreground-tertiary">
              {formatTokenValue(values[index])}
            </Text>
          </View>
        ))}
      </View>
    </Group>
  );
}

function SemanticGroupRows({ hint, kind, title, variables }: SemanticGroup) {
  const values = useCSSVariable(variables);

  return (
    <Group hint={hint} title={title}>
      <View className="gap-2">
        {variables.map((variable, index) => (
          <SpecRow
            key={variable}
            name={variable}
            preview={<Swatch kind={kind} value={values[index]} />}
            value={formatTokenValue(values[index])}
          />
        ))}
      </View>
    </Group>
  );
}

function SurfacePairRows() {
  const values = useCSSVariable(PAIR_VARIABLES);
  const byName = Object.fromEntries(PAIR_VARIABLES.map((name, index) => [name, values[index]]));

  return (
    <Group
      hint="每对表面色与其前景色。「Aa」直接画在该表面上，对比度不够会一眼看出来。"
      title="表面 / 前景配对"
    >
      <View className="gap-2">
        {SURFACE_PAIRS.map(([surface, foreground]) => (
          <View className="flex-row items-center gap-3" key={surface}>
            <View
              className="size-10 items-center justify-center rounded-md border border-border-subtle"
              style={{ backgroundColor: byName[surface] as string }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: byName[foreground] as string }}
              >
                Aa
              </Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-xs text-foreground" numberOfLines={1}>
                {surface}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {foreground}
              </Text>
            </View>
            <View className="items-end gap-0.5">
              <Text className="font-mono text-xs text-foreground-tertiary">
                {formatTokenValue(byName[surface])}
              </Text>
              <Text className="font-mono text-xs text-foreground-tertiary">
                {formatTokenValue(byName[foreground])}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Group>
  );
}

const meta = {
  title: 'Foundations/Colors',
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

/**
 * The Vercel Brand Guidelines ramps, verbatim. Semantic roles never repeat a raw
 * `oklch()` — they reference these, so a step has exactly one edit point.
 */
export const Palette: Story = {
  render: () => (
    <ThemeSplit>
      <Text className="text-xs text-muted-foreground">
        {'--cs-vbg-* 是脚手架命名：primitive.css 里那套遗留调色板还占着 --cs-gray-100 之类的名字。' +
          '等它退役，去掉 -vbg- 是一次纯机械改名，不涉及取值。'}
      </Text>
      {PALETTE_SCALES.map((paletteScale) => (
        <PaletteScaleRow key={paletteScale.title} {...paletteScale} />
      ))}
    </ThemeSplit>
  ),
};

/** What components actually consume — the unprefixed contract. */
export const SemanticRoles: Story = {
  render: () => (
    <ThemeSplit>
      {SEMANTIC_GROUPS.map((group) => (
        <SemanticGroupRows key={group.title} {...group} />
      ))}
    </ThemeSplit>
  ),
};

export const SurfacePairs: Story = {
  render: () => (
    <ThemeSplit>
      <SurfacePairRows />
    </ThemeSplit>
  ),
};
