import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportWatermark, ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { EXPORT_BRAND } from './exportBrand';
import { useExportWatermarkStyle } from './useExportWatermarkStyle';

export function useExportWatermark(style?: ExportWatermarkStyle) {
  const resolvedStyle = useExportWatermarkStyle(style);
  const { t } = useTranslation();
  const [background, foreground, brandColor] = useThemeColor([
    'constant-white',
    'constant-black',
    'brand',
  ]);
  // Document capture observes this value; unrelated screen renders must not restart it.
  return useCallback((): ExportWatermark => {
    switch (resolvedStyle) {
      case 'none':
        return { kind: 'none' };
      case 'cherry':
        return {
          kind: 'cherry',
          signature: {
            ...EXPORT_BRAND,
            background,
            foreground,
            brandColor,
            downloadLabel: t('fileExport.watermark.download'),
            downloadLinkLabel: t('fileExport.watermark.downloadLink'),
          },
        };
    }
  }, [resolvedStyle, background, foreground, brandColor, t]);
}
