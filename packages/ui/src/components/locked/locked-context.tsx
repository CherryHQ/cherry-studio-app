import LockIcon from '@cherrystudio/app-icons/icons/lock';
import { type ComponentType, createContext, type PropsWithChildren, use } from 'react';

/** How locked components name the owner of their value. */
export type LockedAppearance = Readonly<{
  /** The mark drawn in a locked component's affordance slot. Sized and tinted by `className`. */
  icon: ComponentType<{ className?: string }>;
  /** Why the value cannot change; shown when a locked component is pressed. */
  reason?: string;
}>;

const defaultAppearance: LockedAppearance = { icon: LockIcon };

const LockedAppearanceContext = createContext<LockedAppearance>(defaultAppearance);
const LockedScopeContext = createContext(false);
const LockedGroupContext = createContext(false);

/** Names the owner of every locked component below. Without one, locks show a padlock silently. */
export function LockedAppearanceProvider({
  children,
  value,
}: PropsWithChildren<{ value: LockedAppearance }>) {
  return <LockedAppearanceContext value={value}>{children}</LockedAppearanceContext>;
}

export function useLockedAppearance(): LockedAppearance {
  return use(LockedAppearanceContext);
}

/**
 * Locks the editable components below: switches, selections, inputs, tabs and pressable rows that
 * edit a value. A component's own `locked` prop still wins, so a row that only navigates or copies
 * passes `locked={false}`.
 */
export function LockedScope({ children, locked = true }: PropsWithChildren<{ locked?: boolean }>) {
  return <LockedScopeContext value={locked}>{children}</LockedScopeContext>;
}

/** Whether a component locks: its own `locked` prop, otherwise the enclosing scope. */
export function useLocked(locked: boolean | undefined): boolean {
  const scoped = use(LockedScopeContext);
  return locked ?? scoped;
}

export function LockedGroupNesting({ children }: PropsWithChildren) {
  return <LockedGroupContext value>{children}</LockedGroupContext>;
}

/** Sections inside a `LockedGroup` draw no card of their own. */
export function useIsInLockedGroup(): boolean {
  return use(LockedGroupContext);
}
