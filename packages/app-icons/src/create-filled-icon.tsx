import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { createElement, forwardRef, type ComponentType } from 'react';
import * as NativeSvg from 'react-native-svg';

type FilledSvgElementName =
  | 'circle'
  | 'ellipse'
  | 'g'
  | 'line'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'rect';

type FilledIconNode = readonly (readonly [
  FilledSvgElementName,
  Readonly<Record<string, string | number>>,
])[];

type SvgComponent = ComponentType<Record<string, unknown>>;

const svgElements: Record<FilledSvgElementName, SvgComponent> = {
  circle: NativeSvg.Circle as unknown as SvgComponent,
  ellipse: NativeSvg.Ellipse as unknown as SvgComponent,
  g: NativeSvg.G as unknown as SvgComponent,
  line: NativeSvg.Line as unknown as SvgComponent,
  path: NativeSvg.Path as unknown as SvgComponent,
  polygon: NativeSvg.Polygon as unknown as SvgComponent,
  polyline: NativeSvg.Polyline as unknown as SvgComponent,
  rect: NativeSvg.Rect as unknown as SvgComponent,
};

const childDefaultAttributes = {
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function resolveNodeAttributes(
  attributes: Readonly<Record<string, string | number>>,
  resolvedColor: LucideProps['color'],
  resolvedStrokeWidth: number | string,
): Record<string, unknown> {
  const { fill, key: _key, stroke, ...rest } = attributes;
  return {
    ...childDefaultAttributes,
    strokeWidth: resolvedStrokeWidth,
    ...rest,
    fill: fill === 'currentColor' ? resolvedColor : (fill ?? 'none'),
    stroke: stroke === 'currentColor' ? resolvedColor : (stroke ?? 'none'),
  };
}

/** Renders dual-state filled vector nodes wrapped for Uniwind icon compatibility. */
export function createFilledIcon(iconNode: FilledIconNode): LucideIcon {
  const FilledIcon = forwardRef<NativeSvg.Svg, LucideProps>(function FilledIcon(
    {
      absoluteStrokeWidth = false,
      children,
      color = 'currentColor',
      height,
      size = 24,
      strokeWidth = 2,
      width,
      ...props
    },
    ref,
  ) {
    const resolvedWidth = width ?? size;
    const resolvedHeight = height ?? size;
    const resolvedStrokeWidth = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(resolvedWidth)
      : strokeWidth;

    return (
      <NativeSvg.Svg
        ref={ref}
        fill="none"
        height={resolvedHeight}
        viewBox="0 0 24 24"
        width={resolvedWidth}
        {...props}
      >
        {iconNode.map(([elementName, attributes], index) => {
          const resolvedAttrs = resolveNodeAttributes(attributes, color, resolvedStrokeWidth);
          const key = attributes.key ?? `${elementName}-${index}`;
          return createElement(svgElements[elementName], {
            ...resolvedAttrs,
            key,
          });
        })}
        {children}
      </NativeSvg.Svg>
    );
  });

  return FilledIcon as unknown as LucideIcon;
}
