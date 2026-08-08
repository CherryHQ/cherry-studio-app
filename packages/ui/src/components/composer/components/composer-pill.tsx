import { Pressable, View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { Surface } from '../../surface';
import { actionHitSlop, composerActionSize, pillStyle } from '../composer.layout';
import type { ComposerPillProps } from '../composer.types';

/**
 * `Composer.Action`'s wide sibling: the same height and material, but sized to a
 * label rather than to an icon. Use it when a tool has to say what it is set to
 * — the model in use, a mode — instead of only what it does.
 */
export function ComposerPill({
  accessibilityLabel,
  children,
  className = 'bg-surface-secondary',
  disabled = false,
  icon,
  onPress,
  style,
  testID,
}: ComposerPillProps) {
  // Same reason as `Composer.Action`: glass inside glass renders nothing, so the
  // fill is resolved here and handed to both branches.
  const fill = useResolveClassNames(className);
  const tintColor = typeof fill.backgroundColor === 'string' ? fill.backgroundColor : undefined;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      // A pill is the only thing in the toolbar that can be arbitrarily wide, so
      // it is also the thing that has to give: without this, a long label pushes
      // the send button off the row.
      className="min-w-0 shrink"
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
        style={pillStyle}
        tintColor={tintColor}
      >
        {icon ? <View className="shrink-0">{icon}</View> : null}
        {children}
      </Surface>
    </Pressable>
  );
}

ComposerPill.displayName = 'Composer.Pill';
