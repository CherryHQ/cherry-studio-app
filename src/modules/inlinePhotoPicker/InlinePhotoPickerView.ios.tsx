import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';

import type { InlinePhotoPickerViewProps } from './InlinePhotoPickerView.types';

export const InlinePhotoPickerView = requireNativeViewManager(
  'InlinePhotoPicker',
) as ComponentType<InlinePhotoPickerViewProps>;
