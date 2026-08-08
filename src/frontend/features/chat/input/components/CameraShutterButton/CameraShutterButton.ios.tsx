import { Button, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonBorderShape,
  buttonStyle,
  disabled as disabledModifier,
  frame,
} from '@expo/ui/swift-ui/modifiers';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import type { CameraShutterButtonProps } from './CameraShutterButton.types';

// Outer glass ring diameter; `frame` pins it instead of `controlSize` so the
// ring stays a fixed size. The inner white disc is kept smaller so a visible
// glass ring remains around it.
const SHUTTER_DIAMETER = 60;
const SHUTTER_DISC_SIZE = 42;

/**
 * iOS 26 liquid-glass shutter: a 60pt circular glass button with a solid white
 * `circle.fill` at its center — a glass ring around a white disc. Matches the
 * camera control buttons' glass treatment.
 */
export function CameraShutterButton({
  accessibilityLabel,
  disabled = false,
  onPress,
}: CameraShutterButtonProps) {
  const constantWhite = useThemeColor('constant-white');

  return (
    <Host matchContents>
      <Button
        modifiers={[
          buttonStyle('glass'),
          frame({ height: SHUTTER_DIAMETER, width: SHUTTER_DIAMETER }),
          buttonBorderShape('circle'),
          disabledModifier(disabled),
          accessibilityLabelModifier(accessibilityLabel),
        ]}
        onPress={onPress}
      >
        <Image color={constantWhite} size={SHUTTER_DISC_SIZE} systemName="circle.fill" />
      </Button>
    </Host>
  );
}
