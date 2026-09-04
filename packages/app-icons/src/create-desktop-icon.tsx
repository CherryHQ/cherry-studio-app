import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { createElement, forwardRef, type ComponentType } from 'react';
import * as NativeSvg from 'react-native-svg';

type DesktopSvgElementName =
  | 'circle'
  | 'ellipse'
  | 'g'
  | 'line'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'rect';

type DesktopIconNode = readonly (readonly [
  DesktopSvgElementName,
  Readonly<Record<string, string>>,
])[];

type DesktopSvgComponent = ComponentType<Record<string, unknown>>;

const desktopSvgElements: Record<DesktopSvgElementName, DesktopSvgComponent> = {
  circle: NativeSvg.Circle as unknown as DesktopSvgComponent,
  ellipse: NativeSvg.Ellipse as unknown as DesktopSvgComponent,
  g: NativeSvg.G as unknown as DesktopSvgComponent,
  line: NativeSvg.Line as unknown as DesktopSvgComponent,
  path: NativeSvg.Path as unknown as DesktopSvgComponent,
  polygon: NativeSvg.Polygon as unknown as DesktopSvgComponent,
  polyline: NativeSvg.Polyline as unknown as DesktopSvgComponent,
  rect: NativeSvg.Rect as unknown as DesktopSvgComponent,
};

const defaultAttributes = {
  fill: 'none',
  height: 24,
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
  width: 24,
  xmlns: 'http://www.w3.org/2000/svg',
} as const;

const childDefaultAttributes = {
  fill: defaultAttributes.fill,
  stroke: defaultAttributes.stroke,
  strokeLinecap: defaultAttributes.strokeLinecap,
  strokeLinejoin: defaultAttributes.strokeLinejoin,
  strokeWidth: defaultAttributes.strokeWidth,
} as const;

/** Renders vector nodes pinned to the Lucide revision used by Cherry Studio desktop. */
export function createDesktopIcon(iconNode: DesktopIconNode): LucideIcon {
  const DesktopIcon = forwardRef<NativeSvg.Svg, LucideProps>(function DesktopIcon(
    {
      absoluteStrokeWidth = false,
      children,
      color = 'currentColor',
      size = 24,
      strokeWidth = 2,
      ...props
    },
    ref,
  ) {
    const resolvedStrokeWidth = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;
    const customAttributes = {
      stroke: color,
      strokeWidth: resolvedStrokeWidth,
      ...props,
    };

    return (
      <NativeSvg.Svg
        ref={ref}
        {...defaultAttributes}
        height={size}
        width={size}
        {...customAttributes}
      >
        {iconNode.map(([elementName, attributes]) =>
          createElement(desktopSvgElements[elementName], {
            ...childDefaultAttributes,
            ...customAttributes,
            ...attributes,
          }),
        )}
        {children}
      </NativeSvg.Svg>
    );
  });

  return DesktopIcon as unknown as LucideIcon;
}
