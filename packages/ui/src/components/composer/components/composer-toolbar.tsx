import { View } from 'react-native';

import type { ComposerToolbarProps } from '../composer.types';
import { toolbarStyle } from '../utils/composer-layout';

/**
 * The row under the text field. It is one flex row and nothing more: tools sit
 * where they are written, and `Composer.Send` pins itself right on its own, so
 * callers never have to wrap their tools in grouping views.
 */
export function ComposerToolbar({ children, style, testID }: ComposerToolbarProps) {
  return (
    <View className="flex-row items-center" style={[toolbarStyle, style]} testID={testID}>
      {children}
    </View>
  );
}

ComposerToolbar.displayName = 'Composer.Toolbar';
