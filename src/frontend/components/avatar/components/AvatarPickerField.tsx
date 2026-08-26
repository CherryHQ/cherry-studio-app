import type { ReactElement } from 'react';
import { Text, View } from 'react-native';

import { AvatarImagePicker } from './AvatarImagePicker';

type AvatarPickerFieldProps = {
  /** Labels the caption and the whole block for assistive tech. */
  caption: string;
  /** The avatar itself, sized by the caller — the domain owns what it looks like. */
  children: ReactElement;
  onBeforeOpen?: () => void;
  onError: (error: unknown) => void;
  onSelect: (sourceUri: string) => Promise<void> | void;
};

/**
 * The avatar block an editing form opens with: a centred avatar over a caption,
 * both inside one picker trigger so either one opens it.
 *
 * Only the layout and the interaction are shared. Each domain passes its own
 * avatar, because what an unset avatar falls back to is domain knowledge — an
 * Agent's initial, a provider's built-in brand logo.
 */
export function AvatarPickerField({
  caption,
  children,
  onBeforeOpen,
  onError,
  onSelect,
}: AvatarPickerFieldProps) {
  return (
    <View className="items-center">
      <AvatarImagePicker
        accessibilityLabel={caption}
        onBeforeOpen={onBeforeOpen}
        onError={onError}
        onSelect={onSelect}
      >
        <View className="items-center gap-3">
          {children}
          {/* The link blue, not the product red: this reads as an action on the
              avatar above it, the same way a text link does. */}
          <Text className="font-medium text-base text-link">{caption}</Text>
        </View>
      </AvatarImagePicker>
    </View>
  );
}
