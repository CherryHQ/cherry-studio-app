import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { cn } from '../../utils';

/** Opaque menu material, with the shadow outside the content's clipping boundary. */
export function MenuSurface({
  children,
  className = 'bg-popover',
  contentStyle,
  elevated = true,
  style,
}: {
  children: ComponentProps<typeof View>['children'];
  className?: string;
  contentStyle?: ComponentProps<typeof View>['style'];
  elevated?: boolean;
  style?: ComponentProps<typeof View>['style'];
}) {
  return (
    <View
      className={cn(
        'rounded-4xl',
        className,
        elevated && 'shadow-2xl shadow-constant-black/15 dark:shadow-constant-black/60',
      )}
      style={style}
    >
      <View
        className={cn(
          'max-h-full shrink overflow-hidden rounded-4xl',
          elevated && 'dark:bg-secondary',
        )}
        style={contentStyle}
      >
        {children}
      </View>
    </View>
  );
}
