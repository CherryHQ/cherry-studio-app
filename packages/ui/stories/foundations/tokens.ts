/**
 * The token names the `Foundations/*` pages document.
 *
 * Kept apart from the stories so `__tests__/tokens.test.ts` can check every
 * name against the CSS the build actually emits without importing a React tree.
 * A mistyped name does not fail anywhere at runtime — the swatch just renders a
 * placeholder — so the test is the only thing that catches it.
 */

export type BorderStep = { className: string; name: string; usage: string };
export type PaletteScale = { hint: string; title: string; variables: string[] };
export type RadiusStep = { className: string; derivation: string };
export type SemanticGroup = { hint?: string; kind: SwatchKind; title: string; variables: string[] };
export type SwatchKind = 'border' | 'surface' | 'text';
export type TypeStep = { className: string; name: string; role: string; sample: string };
export type WeightStep = { className: string; label: string; note: string };

const neutralSteps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
/** Upstream ships five steps per hue: 100 tint, 400 border, 700 solid, 900 emphasis, 1000 text. */
const hueSteps = [100, 400, 700, 900, 1000];

const scale = (name: string, steps: number[]) => steps.map((step) => `--${name}-${step}`);

export const PALETTE_SCALES: PaletteScale[] = [
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

export const SEMANTIC_GROUPS: SemanticGroup[] = [
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
    hint: '半透明叠加层，随下方表面变化。secondary/muted/accent 三个名字目前是同一个值（gray-alpha-100），按下才升到 300 档。muted 与 accent 是 HeroUI 保留名：契约变量仍声明（此页直接读变量），但不作为 Tailwind 颜色工具类暴露 —— global.css 把它们的 --color-* 形式映射成了 HeroUI 自己的角色。',
    kind: 'surface',
    variables: ['--secondary', '--secondary-active', '--muted', '--accent'],
  },
  {
    title: '品牌',
    hint: '--primary 是主操作颜色；--brand 是固定的 Cherry Studio Logo 红（#ff5757）。两者当前取值相同，但语义仍分开。',
    kind: 'surface',
    variables: ['--primary', '--primary-foreground', '--brand'],
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
    hint: '各自只有一个消费者：代码块与行内代码在 MarkdownText，chat-user 是 user 气泡底色（bg-chat-user）。',
    kind: 'surface',
    variables: ['--code-block', '--inline-code', '--chat-user'],
  },
  {
    title: '恒定黑白',
    hint: '整份 token 里唯一不随主题翻转的一对。给压在照片、相机取景、全屏查看器之上的 chrome 用 —— 底下那层既不是浅色也不是深色表面，跟着主题翻就必然有一个主题下看不见。两个色卡在明暗两个主题里应当完全一样，不一样就说明有人给它加了 .dark 覆盖。',
    kind: 'surface',
    variables: ['--constant-black', '--constant-white'],
  },
  {
    title: '用量热力阶',
    hint: 'AI 用量日历的四档强度，同一个绿档按 25/50/75/100 调出；空白格用的是 --border，不在这里。',
    kind: 'surface',
    variables: ['--usage-level-1', '--usage-level-2', '--usage-level-3', '--usage-level-4'],
  },
  {
    title: '图表',
    hint: 'VBG 明确「分类系列默认单色」，所以这里是一条灰阶而不是彩虹。',
    kind: 'surface',
    variables: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'],
  },
];

export const SURFACE_PAIRS: string[][] = [
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
  ['--tag-amber', '--tag-amber-foreground'],
  ['--tag-blue', '--tag-blue-foreground'],
  ['--tag-green', '--tag-green-foreground'],
  ['--tag-red', '--tag-red-foreground'],
];

export const PAIR_VARIABLES = SURFACE_PAIRS.flat();

const LONG = '设计令牌 Design tokens 0123';
const SHORT = '设计令牌 Ag';
const GLYPHS = 'Ag';

export const WEIGHT_SAMPLE = SHORT;

/**
 * The ladder itself lives in `packages/ui/src/utils/typography-scale.ts` — these
 * rows only name the Tailwind utility each step backs. Sizes are read from
 * `--ui-text-*` at runtime, so an accessibility step shift shows up here too
 * rather than being documented as a fixed number.
 */
export const TYPE_SCALE: TypeStep[] = [
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

export const SIZE_VARIABLES = TYPE_SCALE.flatMap(({ name }) => [
  `--ui-text-${name}`,
  `--ui-text-${name}--line-height`,
]);

/**
 * Deliberately no resolved numbers next to these: only `--font-weight-bold` is
 * authored at all, and it lives in `@theme`, whose variables Tailwind prunes by
 * usage — so reading it back proves nothing about what a utility renders. The
 * last row carries the claim instead: `font-bold` is remapped to 600, so it has
 * to render identically to the row above it. The other three rows are Tailwind's
 * own defaults, which already match VBG.
 */
export const WEIGHTS: WeightStep[] = [
  { className: 'font-normal', label: 'font-normal', note: 'VBG 400 — 正文' },
  { className: 'font-medium', label: 'font-medium', note: 'VBG 500 — 强调、按钮' },
  { className: 'font-semibold', label: 'font-semibold', note: 'VBG 600 — 标题' },
  {
    className: 'font-bold',
    label: 'font-bold',
    note: '已由 700 重映射到 600 —— 应当与上一行完全相同，不同就说明没生效',
  },
];

export const MONO_VARIABLE = '--font-mono';

/**
 * `--radius` is the single authored step (VBG ships only 6px and 8px); every
 * `rounded-sm…4xl` utility is a multiple of it, generated by
 * `packages/design-tokens/scripts/build-native-css.ts`. The derivation is shown
 * instead of a baked px so the table cannot drift away from that script.
 */
export const RADIUS_VARIABLE = '--radius';

export const RADIUS_STEPS: RadiusStep[] = [
  { className: 'rounded-4xs', derivation: '0.5px' },
  { className: 'rounded-3xs', derivation: '1px' },
  { className: 'rounded-2xs', derivation: '1.5px' },
  { className: 'rounded-xs', derivation: '2px' },
  { className: 'rounded-sm', derivation: '--radius × 0.6' },
  { className: 'rounded-md', derivation: '--radius × 0.8' },
  { className: 'rounded-lg', derivation: '--radius' },
  { className: 'rounded-xl', derivation: '--radius × 1.4' },
  { className: 'rounded-2xl', derivation: '--radius × 1.8' },
  { className: 'rounded-3xl', derivation: '--radius × 2.2' },
  { className: 'rounded-4xl', derivation: '--radius × 2.6' },
  { className: 'rounded-full', derivation: '9999px' },
];

export const BORDER_RAMP: BorderStep[] = [
  { className: 'bg-border-subtle', name: '--border-subtle', usage: '同一表面内的分隔线' },
  { className: 'bg-border', name: '--border', usage: '默认描边' },
  { className: 'bg-border-strong', name: '--border-strong', usage: '需要被看见的分组边界' },
  { className: 'bg-border-selected', name: '--border-selected', usage: '选中态' },
];

/** Every variable the pages resolve through `useCSSVariable`. */
export const READ_VARIABLES = [
  ...PALETTE_SCALES.flatMap(({ variables }) => variables),
  ...SEMANTIC_GROUPS.flatMap(({ variables }) => variables),
  ...PAIR_VARIABLES,
  ...SIZE_VARIABLES,
  MONO_VARIABLE,
  RADIUS_VARIABLE,
];
