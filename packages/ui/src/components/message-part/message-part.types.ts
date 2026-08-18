import type { AppIconProps } from '@cherrystudio/app-icons';
import type { ImageSource } from 'expo-image';
import type { ComponentType, ReactNode } from 'react';
import type { PressableProps, ViewProps } from 'react-native';

export type MessagePartRootProps = ViewProps & {
  children: ReactNode;
};

export type MessagePartStatusProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
};

export type MessagePartReasoningProps = {
  children: ReactNode;
  closeAccessibilityLabel: string;
  detailTitle: string;
  state: 'complete' | 'running';
  statusText: string;
  testID?: string;
};

export type MessagePartToolProps = {
  children: ReactNode;
  closeAccessibilityLabel: string;
  icon?: ComponentType<AppIconProps>;
  imageSource?: ImageSource | number;
  state: 'complete' | 'running';
  statusText?: string;
  statusTone?: MessagePartTone;
  testID?: string;
  title: string;
};

export type MessagePartErrorProps = {
  message: string;
  title: string;
};

export type MessagePartPlaceholderProps = {
  description?: string;
  label: string;
  onPress?: () => void;
};

export type MessagePartSourceProps = Omit<PressableProps, 'children' | 'onPress'> & {
  label: string;
  onPress: (url: string) => void;
  url: string;
  variant?: 'card' | 'list-item';
};

export type MessagePartTranslationProps = {
  children: ReactNode;
};

export type MessagePartSectionTitleProps = {
  title: string;
};

export type MessagePartTextSectionProps = MessagePartSectionTitleProps & {
  tone?: Extract<MessagePartTone, 'danger'>;
  value: string;
};

export type MessagePartValueSectionProps = MessagePartSectionTitleProps & {
  maxLength?: number;
  value: unknown;
};

export type MessagePartTone = 'danger' | 'default' | 'warning';
