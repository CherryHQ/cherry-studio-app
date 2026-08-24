import type { LucideIcon as LucideNativeIcon, LucideProps } from 'lucide-react-native';
import type { ComponentType, ReactElement } from 'react';
import { useResolveClassNames } from 'uniwind';

export type LucideIconProps = LucideProps & {
  className?: string;
};

export type LucideIconComponent = ComponentType<LucideIconProps>;

const defaultIconSize = 24;

function toDimension(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}

function toColor(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Wraps one deep-imported Lucide component with the app's Uniwind icon contract. */
export function createIcon(Icon: LucideNativeIcon, displayName: string): LucideIconComponent {
  function LucideIcon({
    accessible,
    className,
    color,
    height,
    size,
    style,
    width,
    ...props
  }: LucideIconProps): ReactElement {
    const styles = useResolveClassNames(className ?? '');
    const resolvedWidth = width ?? size ?? toDimension(styles.width) ?? defaultIconSize;
    const resolvedHeight = height ?? size ?? toDimension(styles.height) ?? defaultIconSize;
    const resolvedColor = color ?? toColor(styles.color);

    return (
      <Icon
        {...props}
        accessible={accessible ?? false}
        color={resolvedColor}
        height={resolvedHeight}
        style={style}
        width={resolvedWidth}
      />
    );
  }

  LucideIcon.displayName = displayName;

  return LucideIcon;
}
