import type { MenuItem } from '@cherrystudio/ui/components';
import type { ComponentType, ReactElement } from 'react';
import type { ImageSourcePropType } from 'react-native';

export type HeaderActionIconProps = {
  className?: string;
};

export type HeaderActionTone = 'default' | 'inverse';

/** The existing action glyph as a template image for the native iOS toolbar. */
export type HeaderNativeIcon = ImageSourcePropType;

export type HeaderActionTargetSize = 'surface' | 'touch-target';

type HeaderActionBase = {
  key: string;
  testID?: string;
};

export type HeaderToolbarAction =
  | (HeaderActionBase & {
      accessibilityLabel: string;
      disabled?: boolean;
      icon: ComponentType<HeaderActionIconProps>;
      /**
       * The same glyph as `icon`, supplied as a template image. The iOS header draws a native item
       * instead of a custom view, which the system can move, such as into an iPhone Duo's
       * vertical rail.
       */
      nativeIcon?: HeaderNativeIcon;
      onPress: () => void;
      type: 'icon';
    })
  | (HeaderActionBase & {
      accessibilityLabel?: string;
      disabled?: boolean;
      label: string;
      onPress: () => void;
      type: 'label';
    })
  | (HeaderActionBase & {
      accessibilityLabel: string;
      disabled?: boolean;
      icon: ComponentType<HeaderActionIconProps>;
      items: readonly MenuItem[];
      /** The same glyph as `icon` for a native toolbar menu; see the icon action's `nativeIcon`. */
      nativeIcon?: HeaderNativeIcon;
      type: 'menu';
    })
  | (HeaderActionBase & {
      element: ReactElement;
      type: 'custom';
    });

export type HeaderActionProps = {
  action: HeaderToolbarAction;
  targetSize?: HeaderActionTargetSize;
  tone?: HeaderActionTone;
};
