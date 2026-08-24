import type { LucideIconProps } from '@cherrystudio/app-icons';
import type { ImageSource } from 'expo-image';
import type { ComponentType } from 'react';

export type BuiltInToolIcon = {
  icon?: ComponentType<LucideIconProps>;
  imageSource?: ImageSource | number;
};
