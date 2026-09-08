import { type ComponentProps, type ReactElement } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

type SidebarExpandIconProps = ComponentProps<typeof Svg> & {
  className?: string;
  size?: number | string;
};

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

/** Exact React Native rendering of desktop's expand-sidebar glyph. */
export default function SidebarExpandIcon({
  accessible,
  className,
  color,
  height,
  size,
  stroke,
  style,
  width,
  ...props
}: SidebarExpandIconProps): ReactElement {
  const styles = useResolveClassNames(className ?? '');
  const resolvedWidth = width ?? size ?? toDimension(styles.width) ?? defaultIconSize;
  const resolvedHeight = height ?? size ?? toDimension(styles.height) ?? defaultIconSize;
  const resolvedColor = stroke ?? color ?? toColor(styles.color) ?? 'currentColor';

  return (
    <Svg
      {...props}
      accessible={accessible ?? false}
      fill="none"
      height={resolvedHeight}
      style={style}
      viewBox="0 0 24 24"
      width={resolvedWidth}
    >
      <Rect height={16} rx={4} stroke={resolvedColor} strokeWidth={1.7} width={17} x={3.5} y={4} />
      <Path d="M9.5 5v14" stroke={resolvedColor} strokeLinecap="round" strokeWidth={1.7} />
    </Svg>
  );
}
