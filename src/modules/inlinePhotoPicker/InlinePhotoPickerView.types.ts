import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type InlinePhotoPickerAsset = {
  assetId: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uri: string;
};

export type InlinePhotoPickerSelectionChangeEventPayload = {
  assets: InlinePhotoPickerAsset[];
};

export type InlinePhotoPickerErrorEventPayload = {
  message: string;
};

export type InlinePhotoPickerSelectionChangeEvent =
  NativeSyntheticEvent<InlinePhotoPickerSelectionChangeEventPayload>;

export type InlinePhotoPickerErrorEvent = NativeSyntheticEvent<InlinePhotoPickerErrorEventPayload>;

export type InlinePhotoPickerActionEvent = NativeSyntheticEvent<Record<string, never>>;

export type InlinePhotoPickerViewProps = ViewProps & {
  // Carries a literal `{count}` token the native confirm button substitutes with
  // the live selection count (e.g. "添加 {count} 张照片").
  confirmLabelTemplate?: string;
  backAccessibilityLabel?: string;
  allPhotosLabel?: string;
  disabled?: boolean;
  resetKey?: number;
  selectionLimit?: number;
  onAllPhotosPress?: (event: InlinePhotoPickerActionEvent) => void;
  onBackPress?: (event: InlinePhotoPickerActionEvent) => void;
  onConfirm?: (event: InlinePhotoPickerActionEvent) => void;
  onError?: (event: InlinePhotoPickerErrorEvent) => void;
  onSelectionChange?: (event: InlinePhotoPickerSelectionChangeEvent) => void;
};
