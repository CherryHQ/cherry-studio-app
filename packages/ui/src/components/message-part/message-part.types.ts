import type { LucideIconProps } from '@cherrystudio/app-icons';
import type { ImageSource } from 'expo-image';
import type { ComponentType, ReactNode } from 'react';
import type { PressableProps, ViewProps } from 'react-native';

import type { BottomSheetSizes } from '../bottom-sheet';

export type MessagePartRootProps = ViewProps & {
  children: ReactNode;
};

export type MessagePartStatusProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  expanded?: boolean;
  onPress?: () => void;
  testID?: string;
};

export type MessagePartReasoningProps = {
  children: ReactNode;
  /** Runs before a reader-initiated inline disclosure toggle. */
  onDisclosureToggle?: () => void;
  state: 'complete' | 'running';
  statusText: string;
  testID?: string;
};

export type MessagePartProcessProps = {
  children: ReactNode;
  /** Runs before a reader-initiated inline disclosure toggle. */
  onDisclosureToggle?: () => void;
  state: 'complete' | 'running';
  title: string;
  testID?: string;
};

export type MessagePartToolGroupProps = {
  children: ReactNode;
  /** Runs before a reader-initiated inline disclosure toggle. */
  onDisclosureToggle?: () => void;
  state: 'complete' | 'running';
  statusText?: string;
  statusTone?: MessagePartTone;
  testID?: string;
  title: string;
};

export type MessagePartDetailProps = {
  children: ReactNode;
  onClose: () => void;
  sizes?: BottomSheetSizes;
  testID?: string;
  title: string;
  variant?: 'default' | 'source-list';
};

export type MessagePartPendingProps = {
  accessibilityLabel: string;
  testID?: string;
};

export type MessagePartUnknownProps = {
  label: string;
  testID?: string;
};

export type MessagePartSummaryProps = {
  icon?: ComponentType<LucideIconProps>;
  imageSource?: ImageSource | number;
  onPress: () => void;
  state: 'complete' | 'running';
  statusText?: string;
  statusTone?: MessagePartTone;
  testID?: string;
  title: string;
};

export type MessagePartToolProps = Omit<
  MessagePartSummaryProps,
  'icon' | 'imageSource' | 'onPress'
> & {
  children: ReactNode;
  detailTitle?: string;
  detailVariant?: 'default' | 'source-list';
};

export type MessagePartErrorProps = {
  /** Read after the label when the block opens a detail surface. */
  accessibilityHint?: string;
  message: string;
  /** Opens a caller-owned detail surface; the block then reads as a button. */
  onPress?: () => void;
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
  variant?: 'body' | 'code';
};

export type MessagePartValueSectionProps = MessagePartSectionTitleProps & {
  maxLength?: number;
  value: unknown;
};

export type MessagePartTone = 'danger' | 'default' | 'warning';
