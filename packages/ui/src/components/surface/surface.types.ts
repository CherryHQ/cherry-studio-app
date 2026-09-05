import type { ReactNode } from 'react';

export type SurfaceProps = {
  children?: ReactNode;
  interactive?: boolean;
  shape?: SurfaceShape;
  testID?: string;
  tone?: SurfaceTone;
};

export type SurfaceShape = 'circle' | 'pill' | 'rounded';
export type SurfaceTone = 'default' | 'sidebar-accent' | 'sidebar-primary';
