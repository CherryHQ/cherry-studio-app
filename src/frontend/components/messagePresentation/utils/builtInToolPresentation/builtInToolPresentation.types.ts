import type { AppIconProps } from '@cherrystudio/app-icons';
import type { ImageSource } from 'expo-image';
import type { ComponentType } from 'react';

export type BuiltInToolPresentation = {
  icon?: ComponentType<AppIconProps>;
  imageSource?: ImageSource | number;
  titleKey: string;
};
