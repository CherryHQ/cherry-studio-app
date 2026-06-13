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

export type InlinePhotoPickerViewProps = ViewProps & {
  disabled?: boolean;
  resetKey?: number;
  selectionLimit?: number;
  onError?: (event: InlinePhotoPickerErrorEvent) => void;
  onSelectionChange?: (event: InlinePhotoPickerSelectionChangeEvent) => void;
};
