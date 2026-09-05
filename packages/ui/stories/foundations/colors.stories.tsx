import type { Meta, StoryObj } from '@storybook/react-native';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { FoundationPage, formatTokenValue, Group, SpecRow, ThemeSplit } from './showcase';
import {
  PAIR_VARIABLES,
  PALETTE_SCALES,
  type PaletteScale,
  SEMANTIC_GROUPS,
  type SemanticGroup,
  SURFACE_PAIRS,
  type SwatchKind,
} from './tokens';

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
        {'调色板不导出成 Tailwind 工具类，组件只消费下面那页的语义契约；' +
          '两者靠形状区分：带档位号的是色阶，角色名的是契约。这里的色块是直接读变量画的。'}
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
