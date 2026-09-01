import type { MenuItem } from '@cherrystudio/ui/components';
import type { ComponentType, ReactElement } from 'react';

export type HeaderActionIconProps = {
  className?: string;
};

export type HeaderActionTone = 'default' | 'inverse';

type HeaderActionBase = {
  key: string;
};

export type HeaderToolbarAction =
  | (HeaderActionBase & {
      accessibilityLabel: string;
      disabled?: boolean;
      icon: ComponentType<HeaderActionIconProps>;
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
      type: 'menu';
    })
  | (HeaderActionBase & {
      element: ReactElement;
      type: 'custom';
    });

export type HeaderActionProps = {
  action: HeaderToolbarAction;
  tone?: HeaderActionTone;
};
