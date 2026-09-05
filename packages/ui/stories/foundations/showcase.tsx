import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ScopedTheme } from 'uniwind';

/**
 * Shared shell for the `Foundations/*` stories.
 *
 * These pages document the tokens themselves rather than a component, so they
 * read values straight out of the theme with `useCSSVariable`. That hook
 * resolves against the nearest `ScopedTheme`, which is what lets a single page
 * show light and dark side by side.
 */

const THEMES = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

export function FoundationPage({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="flex-grow"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

/** Renders the same content once per theme, each block on its own background. */
export function ThemeSplit({ children }: { children: ReactNode }) {
  return (
    <View>
      {THEMES.map(({ label, value }) => (
        <ScopedTheme key={value} theme={value}>
          <View className="gap-8 bg-background px-4 py-6">
            <Text className="text-xs font-semibold uppercase text-foreground-tertiary">
              {label}
            </Text>
            {children}
          </View>
        </ScopedTheme>
      ))}
    </View>
  );
}

export function Group({
  children,
  hint,
  title,
}: {
  children: ReactNode;
  hint?: string;
  title: string;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** `[preview] name … value` — the row shape shared by every foundations table. */
export function SpecRow({
  name,
  preview,
  value,
}: {
  name: string;
  preview?: ReactNode;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {preview}
      <Text className="flex-1 text-xs text-foreground" numberOfLines={1}>
        {name}
      </Text>
      <Text className="font-mono text-xs text-foreground-tertiary">{value}</Text>
    </View>
  );
}

/**
 * Uniwind hands colours back as hex (culori-normalised) and lengths back as
 * numbers. `undefined` means the variable never reached the runtime, which is a
 * finding rather than a rendering detail — hence the visible placeholder.
 */
export function formatTokenValue(value: number | string | undefined): string {
  if (value === undefined) {
    return '— missing —';
  }

  if (typeof value === 'number') {
    return `${value}px`;
  }

  return value.startsWith('#') ? value.toUpperCase() : value;
}
