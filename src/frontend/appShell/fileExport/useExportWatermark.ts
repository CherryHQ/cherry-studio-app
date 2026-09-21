import { useCallback } from 'react';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportWatermark, ExportWatermarkStyle } from '@/shared/contracts/fileExport';
import { formatExportTimestamp } from '@/shared/utils/exportSignature';

import { EXPORT_BRAND } from './exportBrand';
import { useExportWatermarkStyle } from './useExportWatermarkStyle';

export function useExportWatermark(style?: ExportWatermarkStyle) {
  const resolvedStyle = useExportWatermarkStyle(style);
  const [background, foreground] = useThemeColor(['constant-white', 'constant-black']);
  // Document capture observes this value; unrelated screen renders must not restart it.
  return useCallback(
    (timestamp = formatExportTimestamp(new Date())): ExportWatermark => {
      switch (resolvedStyle) {
        case 'none':
          return { kind: 'none' };
        case 'cherry':
          return {
            kind: 'cherry',
            signature: { ...EXPORT_BRAND, background, foreground, timestamp },
          };
      }
    },
    [resolvedStyle, background, foreground],
  );
}
