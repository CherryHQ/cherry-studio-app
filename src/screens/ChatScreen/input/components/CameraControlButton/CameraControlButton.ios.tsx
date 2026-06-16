import { Button, Host, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
} from '@expo/ui/swift-ui/modifiers';

import type { CameraControlButtonProps } from './CameraControlButton.types';

/**
 * iOS 26 liquid-glass control matching the inline photo picker's glass buttons
 * 1:1 — `buttonStyle('glass')` + `controlSize('large')` +
 * `buttonBorderShape('circle')` (perfect circle, same size). The SF Symbol is
 * passed as the button's child `Image` exactly like the picker's
 * `Button { Image(systemName:) }`; using a text `label` + `labelStyle('iconOnly')`
 * instead renders a visible label-container border on the glass, so it's avoided.
 *
 * Requires @expo/ui >= 56.0.13 for `buttonBorderShape`.
 */
export function CameraControlButton({
  accessibilityLabel,
  disabled = false,
  onPress,
  sfSymbol,
}: CameraControlButtonProps) {
  return (
    <Host matchContents>
      <Button
        modifiers={[
          buttonStyle('glass'),
          controlSize('large'),
          buttonBorderShape('circle'),
          disabledModifier(disabled),
          accessibilityLabelModifier(accessibilityLabel),
        ]}
        onPress={onPress}
      >
        <Image color="#FFFFFF" systemName={sfSymbol} />
      </Button>
    </Host>
  );
}
