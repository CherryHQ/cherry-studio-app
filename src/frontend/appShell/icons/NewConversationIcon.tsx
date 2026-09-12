import { type ComponentProps, type ReactElement } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

type NewConversationIconProps = ComponentProps<typeof Svg> & {
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

/** Exact React Native rendering of desktop's branded new-conversation glyph. */
export default function NewConversationIcon({
  accessible,
  className,
  color,
  height,
  size,
  stroke,
  style,
  width,
  ...props
}: NewConversationIconProps): ReactElement {
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
      stroke={resolvedColor}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      style={style}
      viewBox="0 0 24 24"
      width={resolvedWidth}
    >
      <G transform="translate(12 12) scale(1.1) translate(-12 -12)">
        <Path d="M13 4H6a2 2 0 0 0-2 2v13l4-3h10a2 2 0 0 0 2-2v-3" />
        <Path d="M18 3.5v5" />
        <Path d="M15.5 6h5" />
      </G>
    </Svg>
  );
}
