import type { ReactNode, Ref } from 'react';
import type { StyleProp, TextInput, TextStyle, ViewStyle } from 'react-native';

export type ComposerAttachment = {
  id: string;
  /** Accessible name of the thumbnail. Falls back to `labels.attachment`. */
  name?: string;
  uri: string;
};

/**
 * Every user-facing string the composer renders on the caller's behalf. Tools
 * injected into the toolbar carry their own labels, so this only covers the
 * parts the composer owns. The package carries no i18n, so callers inject their
 * translations; the defaults are English placeholders that keep Storybook and
 * tests readable.
 */
export type ComposerLabels = {
  attachment: string;
  removeAttachment: string;
  send: string;
  stop: string;
};

export type ComposerProps = {
  /** Thumbnails shown by `Composer.Attachments`. The strip collapses to zero height when empty. */
  attachments?: readonly ComposerAttachment[];
  autoFocus?: boolean;
  /**
   * Overrides the built-in "there is text or an attachment" rule. Pass it when
   * sendability depends on something the composer cannot see — an image model
   * that has to be picked first, or a mode that needs no prompt at all.
   */
  canSend?: boolean;
  /**
   * The composer's contents. Defaults to the standard layout: attachments, the
   * text field, and a toolbar holding nothing but the send button. Pass your own
   * to arrange the parts freely — nothing is mandatory, not even sending.
   */
  children?: ReactNode;
  labels?: Partial<ComposerLabels>;
  /** Omit to render the thumbnails without a remove badge. */
  onAttachmentRemove?: (id: string) => void;
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
   * The circle's fill. Also drives the glass tint — an untinted `GlassView`
   * sitting on the composer's own surface renders nothing at all.
   */
  className?: string;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ComposerAttachmentsProps = {
  testID?: string;
};

export type ComposerCollapsibleProps = {
  /** Render `null` to collapse. The last non-empty frame stays up until the collapse lands. */
  children?: ReactNode;
  /** Overrides the default inset — pass `{ paddingHorizontal: 0 }` for a row that bleeds to the edge. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ComposerInputProps = {
  autoFocus?: boolean;
  placeholder?: string;
  ref?: Ref<TextInput>;
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
