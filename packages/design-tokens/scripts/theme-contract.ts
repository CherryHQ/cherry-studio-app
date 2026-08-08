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

export const RUNTIME_THEME_INPUT_TOKENS = ['primary', 'primary-foreground'] as const

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

export const SHADCN_SURFACE_PAIRS = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['muted', 'muted-foreground'],
  ['accent', 'accent-foreground'],
  ['destructive', 'destructive-foreground'],
  ['sidebar', 'sidebar-foreground'],
  ['sidebar-primary', 'sidebar-primary-foreground'],
  ['sidebar-accent', 'sidebar-accent-foreground']
] as const

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

export const CHERRY_PRODUCT_SURFACE_PAIRS = [
  ['success-subtle', 'success-subtle-foreground'],
  ['warning-subtle', 'warning-subtle-foreground'],
  ['info-subtle', 'info-subtle-foreground'],
  ['error-subtle', 'error-subtle-foreground'],
  ['inline-code', 'inline-code-foreground']
] as const
