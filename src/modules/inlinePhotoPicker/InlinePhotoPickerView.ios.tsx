import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';

import type { InlinePhotoPickerViewProps } from './InlinePhotoPickerView.types';

export const InlinePhotoPickerView = requireNativeView(
  'InlinePhotoPicker',
) as ComponentType<InlinePhotoPickerViewProps>;
