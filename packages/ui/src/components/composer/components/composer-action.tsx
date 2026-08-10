import { Pressable } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { Surface } from '../../surface';
import { actionHitSlop, actionStyle, composerActionSize } from '../composer.layout';
import type { ComposerActionProps } from '../composer.types';

/**
 * A toolbar button: a circular surface carrying one icon. Every tool injected
 * into the toolbar should be one of these, so the row stays one size and one
 * material no matter who contributed it.
 */
export function ComposerAction({
  accessibilityLabel,
  children,
  className = 'bg-secondary',
  disabled = false,
  onPress,
  style,
  testID,
}: ComposerActionProps) {
  // Glass inside glass renders nothing — the material has nothing behind it to
  // refract, so an untinted button on the composer's own surface is invisible
  // (measured: not one pixel of change across the circle's edge). Resolving the
  // fill here and handing it to both branches means callers never have to know.
  const fill = useResolveClassNames(className);
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
        className={className}
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
