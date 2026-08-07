import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type ComposerAttachment = {
  id: string;
  /** Accessible name of the thumbnail. Falls back to `labels.attachment`. */
  name?: string;
  uri: string;
};

/**
 * Every user-facing string the composer renders. The package carries no i18n,
 * so callers inject their translations; the defaults are English placeholders
 * that keep Storybook and tests readable.
 */
export type ComposerLabels = {
  addAttachment: string;
  attachment: string;
  removeAttachment: string;
  send: string;
  stop: string;
};

export type ComposerProps = {
  /** Thumbnails shown above the text field. The strip collapses to zero height when empty. */
  attachments?: readonly ComposerAttachment[];
  autoFocus?: boolean;
  labels?: Partial<ComposerLabels>;
  /**
   * Replaces the built-in "+" circle — pass a menu/sheet trigger to own the
   * attachment flow. `onLeadingPress` is ignored when this is set.
   */
  leading?: ReactNode;
  /** Omit to render the thumbnails without a remove badge. */
  onAttachmentRemove?: (id: string) => void;
  onChangeText: (text: string) => void;
  onLeadingPress?: () => void;
  /** Fired only when there is sendable content (text or attachments). */
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
