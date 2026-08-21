/**
 * Machine-readable theme contract.
 *
 * Mobile-owned. This file used to be mirrored from the desktop
 * `packages/ui/scripts/theme-contract.ts` on every `pnpm design:sync`, on the
 * theory that token *names* are a shared contract even though the Vercel Brand
 * Guidelines fork made the *values* mobile's own. That theory does not survive
 * contact with the goal: mobile is retiring the roles it does not render, and a
 * sync that reinstates a desktop-only name would undo each deletion. Nothing
 * crosses the wire between the two apps here — these names only ever meet CSS
 * in the same repository — so there is no serialized contract to align.
 *
 * Runtime inputs are host-written internal values, not public component roles.
 * Stability and Tailwind exposure are independent decisions:
 * - stable unprefixed product variables are valid defaults for new product code;
 * - migration variables exist only to preserve historical rendering while
 *   consumers are replaced;
 * - Tailwind color variables are generated only for roles used as utilities.
 */

/* `RUNTIME_THEME_INPUT_TOKENS` stood here, naming the `--theme-primary` pair the
 * app rewrote at startup from `ui.theme_user.color_primary`. Mobile has no UI
 * that writes that preference — bootstrap read it and nothing else touched it —
 * so the indirection made one unreachable setting configurable. `--primary` now
 * reads `--brand` in shadcn.css. The preference key itself stays in
 * packages/universal: it is persisted data shared with desktop. */

export const SHADCN_COLOR_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring'
] as const

export const SHADCN_VARIABLE_TOKENS = [...SHADCN_COLOR_TOKENS, 'radius'] as const

/**
 * HeroUI 1.x claims these names for its own roles: the host maps
 * `--color-accent` to `--primary` and `--color-muted` to `--muted-foreground`
 * in `src/frontend/styles/global.css`, overriding what the generated adapter
 * would emit. The contract variables (`--muted`, `--accent`, …) stay declared —
 * the HeroUI bridge reads them — but they must not become Cherry utilities or
 * `useThemeColor` names, or the same name resolves to two different colours
 * depending on which layer wins.
 */
export const HEROUI_RESERVED_COLOR_TOKENS = ['muted', 'accent', 'accent-foreground'] as const

type ShadcnColorToken = (typeof SHADCN_COLOR_TOKENS)[number]
type HerouiReservedColorToken = (typeof HEROUI_RESERVED_COLOR_TOKENS)[number]

/** Shadcn roles exposed as Tailwind colours and `useThemeColor` names. */
export const SHADCN_PUBLIC_COLOR_TOKENS = SHADCN_COLOR_TOKENS.filter(
  (name): name is Exclude<ShadcnColorToken, HerouiReservedColorToken> =>
    !(HEROUI_RESERVED_COLOR_TOKENS as readonly string[]).includes(name)
)

export const CHERRY_PRODUCT_VARIABLE_TOKENS = [
  /* Shared product semantics */
  'brand',
  'background-subtle',
  'foreground-tertiary',
  'foreground-disabled',
  'border-subtle',
  'border-strong',
  'border-selected',
  'link',
  'secondary-active',

  /* Feedback */
  'success',
  'success-subtle',
  'success-subtle-foreground',
  'success-border',
  'warning',
  'warning-subtle',
  'warning-subtle-foreground',
  'warning-border',
  'info',
  'info-subtle',
  'info-subtle-foreground',
  'info-border',
  'error',
  'error-subtle',
  'error-subtle-foreground',
  'error-border',

  /* Product domains
   * `reference{,-foreground,-subtle}` and `highlight{,-foreground,-accent}` were
   * here too. Mobile renders citations as ordinary markdown links and has no
   * search-term highlighting at all, so those six named a UI that does not
   * exist. Reintroduce them alongside the component, not before it. */
  'code-block',
  'inline-code',
  'inline-code-foreground',
  'chat-user',
  'tag-amber',
  'tag-amber-foreground',
  'tag-blue',
  'tag-blue-foreground',
  'tag-green',
  'tag-green-foreground',
  'tag-red',
  'tag-red-foreground',
  'constant-black',
  'constant-white',
  'scrim',
  'grouped-background',
  'grouped-surface',
  'usage-level-1',
  'usage-level-2',
  'usage-level-3',
  'usage-level-4'
] as const

/**
 * Every product variable currently doubles as a Tailwind color, so this is the
 * whole list above. Kept as its own export because the two answer different
 * questions — "must be declared" versus "is exposed to utilities" — and a future
 * non-color product variable would separate them again.
 */
export const CHERRY_PRODUCT_COLOR_TOKENS = CHERRY_PRODUCT_VARIABLE_TOKENS

/* `COMPATIBILITY_{SEMANTIC,STATUS,}_COLOR_TOKENS` stood here: a frozen,
 * shrink-only surface of historical utilities — destructive-hover,
 * secondary-hover, secondary-active, ghost-active, and an empty status list.
 * Nothing read them, not even the generator or `check.ts`, so they froze
 * nothing; three of the four names have no consumer left anywhere, and the
 * fourth (`secondary-active`) is a live product token declared above. */

/* `SHADCN_SURFACE_PAIRS` and `CHERRY_PRODUCT_SURFACE_PAIRS` stood here, listing
 * which foreground belongs on which surface. Neither had a reader: `check.ts`
 * and `build-native-css.ts` never imported them, and the Storybook page that
 * renders the pairs keeps its own list in `packages/ui/stories/foundations/
 * tokens.ts` — so these two copies could disagree with what is documented on
 * screen and nothing would notice. If a pair ever needs enforcing, it belongs
 * in `check.ts` as an assertion, not in a list no one reads. */
