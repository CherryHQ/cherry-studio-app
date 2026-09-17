import { useCallback } from 'react';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import {
  DEFAULT_EXPORT_WATERMARK_STYLE,
  type ExportWatermark,
  type ExportWatermarkStyle,
} from '@/shared/contracts/fileExport';
import { formatExportTimestamp } from '@/shared/utils/exportSignature';

import { EXPORT_BRAND } from './exportBrand';

export function useExportWatermark(style: ExportWatermarkStyle = DEFAULT_EXPORT_WATERMARK_STYLE) {
  const [background, foreground] = useThemeColor(['constant-white', 'constant-black']);
  // Document capture observes this value; unrelated screen renders must not restart it.
  return useCallback(
    (timestamp = formatExportTimestamp(new Date())): ExportWatermark => {
      switch (style) {
        case 'none':
          return { kind: 'none' };
        case 'cherry':
          return {
            kind: 'cherry',
            signature: { ...EXPORT_BRAND, background, foreground, timestamp },
          };
      }
    },
    [style, background, foreground],
  );
}
