import { useResolveClassNames } from 'uniwind';

import { SurfaceFrame } from './surface-frame';
import type { SurfaceProps, SurfaceShape, SurfaceTone } from './surface.types';

const toneClassNames: Record<SurfaceTone, string> = {
  default: 'bg-card',
  'sidebar-accent': 'bg-sidebar-accent',
  'sidebar-primary': 'bg-sidebar-primary',
};

const shapeSpecs: Record<SurfaceShape, { className: string; cornerRadius: number }> = {
  circle: { className: 'rounded-full', cornerRadius: 9999 },
  pill: { className: 'rounded-full', cornerRadius: 9999 },
  rounded: { className: 'rounded-2xl', cornerRadius: 16 },
};

export function Surface({
  children,
  interactive,
  shape = 'rounded',
  testID,
  tone = 'default',
}: SurfaceProps) {
  const toneClassName = toneClassNames[tone];
  const toneStyle = useResolveClassNames(toneClassName);
  const tintColor =
    typeof toneStyle.backgroundColor === 'string' ? toneStyle.backgroundColor : undefined;
  const shapeSpec = shapeSpecs[shape];

  return (
    <SurfaceFrame
      className={`${toneClassName} ${shapeSpec.className}`}
      cornerRadius={shapeSpec.cornerRadius}
      interactive={interactive}
      testID={testID}
      tintColor={tintColor}
    >
      {children}
    </SurfaceFrame>
  );
}
