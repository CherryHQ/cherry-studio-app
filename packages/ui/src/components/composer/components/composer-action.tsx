import { Pressable } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { Surface } from '../../surface';
import type { ComposerActionProps } from '../composer.types';
import { actionHitSlop, actionStyle, composerActionSize } from '../utils/composer-layout';

/**
 * A toolbar button: a circular surface carrying one icon. Every tool injected
 * into the toolbar should be one of these, so the row stays one size and one
 * material no matter who contributed it.
 */
export function ComposerAction({
  accessibilityLabel,
  children,
  className,
  disabled = false,
  onPress,
  style,
  testID,
}: ComposerActionProps) {
  // Glass inside glass renders nothing — the material has nothing behind it to
  // refract, so an untinted button on the composer's own surface is invisible
  // (measured: not one pixel of change across the circle's edge). Keep the
  // shipped glass tint while the fallback follows the grouped-surface palette;
  // an explicit caller fill still drives both branches.
  const fallbackClassName = className ?? 'bg-grouped-background';
  const fill = useResolveClassNames(className ?? 'bg-secondary');
  const tintColor = typeof fill.backgroundColor === 'string' ? fill.backgroundColor : undefined;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={actionHitSlop}
      onPress={onPress}
      style={style}
      testID={testID}
    >
      <Surface
        className={fallbackClassName}
        cornerRadius={composerActionSize / 2}
        interactive
        style={actionStyle}
        tintColor={tintColor}
      >
        {children}
      </Surface>
    </Pressable>
  );
}

ComposerAction.displayName = 'Composer.Action';
