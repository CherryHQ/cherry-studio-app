import type { ReactElement } from 'react';
import { Circle, Path, Rect, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { NavTabId } from './dockTabs';

type NavIconProps = {
  className?: string;
  color?: string;
  filled?: boolean;
  id: NavTabId;
  size?: number;
  strokeWidth?: number;
};

function toColor(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toDimension(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Dual-state (outline vs filled) navigation glyph aligned with `@cherrystudio/app-icons`
 * and the approved v6 floating navigation spec.
 */
export function NavIcon({
  className,
  color,
  filled = false,
  id,
  size,
  strokeWidth = 1.85,
}: NavIconProps): ReactElement {
  const styles = useResolveClassNames(className ?? '');
  const resolvedColor = color ?? toColor(styles.color) ?? 'currentColor';
  const resolvedSize = size ?? toDimension(styles.width) ?? 24;

  const common = {
    fill: 'none',
    stroke: resolvedColor,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  };

  return (
    <Svg height={resolvedSize} viewBox="0 0 24 24" width={resolvedSize}>
      {id === 'chat' ? (
        <Path
          d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
          fill={filled ? resolvedColor : 'none'}
          stroke={filled ? 'none' : resolvedColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ) : id === 'agents' ? (
        <>
          <Path {...common} d="M14 4.1 12 6" />
          <Path {...common} d="m5.1 8-2.9-.8" />
          <Path {...common} d="m6 12-1.9 2" />
          <Path {...common} d="M7.2 2.2 8 5.1" />
          <Path
            d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"
            fill={filled ? resolvedColor : 'none'}
            stroke={resolvedColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        </>
      ) : id === 'more' ? (
        <>
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={7}
            rx={1.5}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={7}
            x={3}
            y={3}
          />
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={7}
            rx={1.5}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={7}
            x={14}
            y={3}
          />
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={7}
            rx={1.5}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={7}
            x={14}
            y={14}
          />
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={7}
            rx={1.5}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={7}
            x={3}
            y={14}
          />
        </>
      ) : id === 'drawings' ? (
        filled ? (
          <Path
            d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM14.7 6.5a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm4 4a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm-11 2a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0zm2-5a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0z"
            fill={resolvedColor}
            fillRule="evenodd"
          />
        ) : (
          <>
            <Path
              {...common}
              d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"
            />
            <Circle cx={13.5} cy={6.5} fill={resolvedColor} r={0.6} />
            <Circle cx={17.5} cy={10.5} fill={resolvedColor} r={0.6} />
            <Circle cx={6.5} cy={12.5} fill={resolvedColor} r={0.6} />
            <Circle cx={8.5} cy={7.5} fill={resolvedColor} r={0.6} />
          </>
        )
      ) : id === 'plugins' ? (
        <>
          {filled ? (
            <Path
              d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42ZM12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3ZM7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"
              fill={resolvedColor}
              fillOpacity={0.24}
              stroke={resolvedColor}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={strokeWidth}
            />
          ) : (
            <>
              <Path
                {...common}
                d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"
              />
              <Path
                {...common}
                d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"
              />
              <Path
                {...common}
                d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"
              />
            </>
          )}
          <Path {...common} d="m7 16.5-4.74-2.85" />
          <Path {...common} d="m7 16.5 5-3" />
          <Path {...common} d="M7 16.5v5.17" />
          <Path {...common} d="m17 16.5-5-3" />
          <Path {...common} d="m17 16.5 4.74-2.85" />
          <Path {...common} d="M17 16.5v5.17" />
          <Path {...common} d="M12 8 7.26 5.15" />
          <Path {...common} d="m12 8 4.74-2.85" />
          <Path {...common} d="M12 13.5V8" />
        </>
      ) : id === 'marketplace' ? (
        <>
          {filled ? (
            <Path
              {...common}
              d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"
              fill={resolvedColor}
              fillOpacity={0.22}
            />
          ) : (
            <Path {...common} d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
          )}
          <Path {...common} d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
          <Path
            d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"
            fill={filled ? resolvedColor : 'none'}
            stroke={resolvedColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        </>
      ) : id === 'files' ? (
        <Path
          d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          fill={filled ? resolvedColor : 'none'}
          stroke={filled ? 'none' : resolvedColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ) : (
        <>
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={6}
            rx={1}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={6}
            x={16}
            y={16}
          />
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={6}
            rx={1}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={6}
            x={2}
            y={16}
          />
          <Rect
            fill={filled ? resolvedColor : 'none'}
            height={6}
            rx={1}
            stroke={filled ? 'none' : resolvedColor}
            strokeWidth={strokeWidth}
            width={6}
            x={9}
            y={2}
          />
          <Path {...common} d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <Path {...common} d="M12 12V8" />
        </>
      )}
    </Svg>
  );
}
