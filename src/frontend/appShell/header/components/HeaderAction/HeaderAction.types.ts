import type { MenuItem } from '@cherrystudio/ui/components';
import type { Stack } from 'expo-router';
import type { ComponentProps, ComponentType, ReactElement } from 'react';

export type HeaderActionIconProps = {
  className?: string;
};

export type HeaderActionTone = 'default' | 'inverse';

/** An SF Symbol name for the native iOS toolbar item. */
export type HeaderNativeIcon = Extract<ComponentProps<typeof Stack.Toolbar.Button>['icon'], string>;

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
       * The SF Symbol for this action. With it, the iOS header draws a standard toolbar item
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
      /** The SF Symbol for a native toolbar menu; see the icon action's `nativeIcon`. */
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
