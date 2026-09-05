import type { PasteEventPayload } from 'expo-paste-input';
import type { ReactNode, RefObject } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  EnrichedMarkdownTextInputInstance,
  MarkdownTextInputStyle,
} from 'react-native-enriched-markdown';

/**
 * Every user-facing string the composer renders on the caller's behalf. Tools
 * injected into the toolbar carry their own labels, so this only covers the
 * parts the composer owns. The package carries no i18n, so callers inject their
 * translations; the defaults are English placeholders that keep Storybook and
 * tests readable.
 */
export type ComposerLabels = {
  send: string;
  stop: string;
};

export type ComposerProps = {
  autoFocus?: boolean;
  /**
   * Overrides the built-in "there is text" rule. Pass it when sendability
   * depends on something the composer cannot see — an attachment the caller
   * holds, an image model that has to be picked first, or a mode that needs no
   * prompt at all.
   */
  canSend?: boolean;
  /**
   * The composer's contents. Defaults to the standard layout: the text field
   * and a toolbar holding nothing but the send button. Pass your own to arrange
   * the parts freely — nothing is mandatory, not even sending.
   */
  children?: ReactNode;
  labels?: Partial<ComposerLabels>;
  onChangeText: (text: string) => void;
  /** Fired only when `canSend` holds. */
  onSend: () => void;
  /** Required for `streaming` to be actionable; without it the button stays a send arrow. */
  onStop?: () => void;
  placeholder?: string;
  /** Turns the send arrow into a stop square while a reply streams in. */
  streaming?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: string;
};

export type ComposerActionProps = {
  accessibilityLabel: string;
  /** The icon. Size it via className on the icon itself. */
  children: ReactNode;
  /**
   * Overrides the circle's adaptive fill and its glass tint. An untinted nested
   * `GlassView` sitting on the composer's own surface renders nothing at all.
   */
  className?: string;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ComposerPillProps = {
  accessibilityLabel: string;
  /**
   * The label. Mark it `numberOfLines={1}` and let it shrink — the pill gives up
   * width before the toolbar does, but only the caller can say how its text ends.
   */
  children: ReactNode;
  /** Overrides the adaptive fill and its glass tint. Same rule as `Composer.Action`. */
  className?: string;
  disabled?: boolean;
  /** Held at its natural size, so a long label squeezes the text and not the icon. */
  icon?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ComposerCollapsibleProps = {
  /** Render `null` to collapse. The last non-empty frame stays up until the collapse lands. */
  children?: ReactNode;
  /** Applied to the measured content, not the clip — pass padding here and the row animates to include it. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The field's imperative half — what a caller needs to insert an entity the
 * text alone cannot express, or to take focus away. `Composer` is otherwise
 * controlled; this exists because a link is a range with a URL attached, and
 * there is no string a caller could hand to `onChangeText` that means one.
 */
export type ComposerInputHandle = EnrichedMarkdownTextInputInstance;

export type ComposerInputProps = {
  autoFocus?: boolean;
  /**
   * Styling for the entities the field can contain. Left to the caller because
   * what a link *means* here is the caller's: the composer has no idea one URL
   * scheme is a tool mention and another is a web address.
   */
  markdownStyle?: MarkdownTextInputStyle;
  onBlur?: () => void;
  onFocus?: () => void;
  /**
   * Every paste, not just the ones the composer could use — text arrives here
   * too, already handled by the field. Callers filter for what they want.
   */
  onPaste?: (payload: PasteEventPayload) => void;
  placeholder?: string;
  /**
   * A ref object, not a callback ref — the underlying input only accepts the
   * former, and the field reads it too so it can push caller-side changes down.
   */
  ref?: RefObject<ComposerInputHandle | null>;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

export type ComposerSendProps = {
  testID?: string;
};

export type ComposerToolbarProps = {
  /** Tools, in paint order. `Composer.Send` pins itself right, so tools written before it pack left. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
