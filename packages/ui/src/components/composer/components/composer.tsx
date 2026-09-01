import { useMemo } from 'react';
import { View } from 'react-native';

import { Surface } from '../../surface';
import type { ComposerLabels, ComposerProps } from '../composer.types';
import {
  ComposerActionsContext,
  type ComposerActionsContextValue,
  ComposerStateContext,
  type ComposerStateContextValue,
} from '../hooks/use-composer-context';
import { surfaceRadius, surfaceStyle } from '../utils/composer-layout';
import { ComposerAction } from './composer-action';
import { ComposerCollapsible } from './composer-collapsible';
import { ComposerDock } from './composer-dock';
import { ComposerInput } from './composer-input';
import { ComposerPill } from './composer-pill';
import { ComposerSend } from './composer-send';
import { ComposerToolbar } from './composer-toolbar';
import { MorphMenu } from './morph-menu';

const defaultLabels: ComposerLabels = {
  send: 'Send message',
  stop: 'Stop generating',
};

/**
 * A composer surface: a text field that grows with its content and, under it, a
 * toolbar row. Nothing but the field is built in — tools are injected as
 * children, so the same component backs a chat screen, an image prompt, or
 * whatever comes next.
 *
 * Controlled — `value` and its callbacks are the caller's to own. The field
 * underneath is a rich text input and owns its own buffer, so `value` is
 * Markdown rather than the glyphs on screen, and it is pushed down only when it
 * differs from what the field last reported. Pass `children` to arrange the
 * parts yourself; the default is the standard layout with a lone send button.
 */
function ComposerRoot({
  autoFocus = false,
  canSend,
  children,
  labels,
  onChangeText,
  onSend,
  onStop,
  placeholder,
  streaming = false,
  style,
  testID,
  value,
}: ComposerProps) {
  const state = useMemo<ComposerStateContextValue>(
    () => ({
      canSend: canSend ?? value.trim().length > 0,
      labels: labels ? { ...defaultLabels, ...labels } : defaultLabels,
      streaming,
      value,
    }),
    [canSend, labels, streaming, value],
  );

  // Split from the state on purpose: this half only changes when the caller's
  // handlers do, so a tool that merely acts — opens a menu, toggles a setting —
  // keeps its identity while the user types. Nothing derived from `value` may
  // leak in here, or the split buys nothing.
  const actions = useMemo<ComposerActionsContextValue>(
    () => ({
      changeText: onChangeText,
      send: onSend,
      stop: onStop,
    }),
    [onChangeText, onSend, onStop],
  );

  return (
    <View style={style} testID={testID}>
      <Surface
        className="bg-grouped-surface ios:shadow-field android:shadow-sm"
        cornerRadius={surfaceRadius}
        style={surfaceStyle}
      >
        <ComposerStateContext value={state}>
          <ComposerActionsContext value={actions}>
            {children ?? (
              <>
                <ComposerInput
                  autoFocus={autoFocus}
                  placeholder={placeholder}
                  testID={testID ? `${testID}-input` : undefined}
                />
                <ComposerToolbar>
                  <ComposerSend testID={testID ? `${testID}-send` : undefined} />
                </ComposerToolbar>
              </>
            )}
          </ComposerActionsContext>
        </ComposerStateContext>
      </Surface>
    </View>
  );
}

ComposerRoot.displayName = 'Composer';

export const Composer = Object.assign(ComposerRoot, {
  Action: ComposerAction,
  Collapsible: ComposerCollapsible,
  Dock: ComposerDock,
  Input: ComposerInput,
  Menu: MorphMenu,
  Pill: ComposerPill,
  Send: ComposerSend,
  Toolbar: ComposerToolbar,
});
