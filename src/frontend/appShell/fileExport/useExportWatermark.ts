import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportWatermark, ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { EXPORT_BRAND, EXPORT_BRAND_LOGOS } from './exportBrand';
import { useExportWatermarkStyle } from './useExportWatermarkStyle';

export function useExportWatermark(
  style?: ExportWatermarkStyle,
  surface: 'white' | 'card' = 'white',
) {
  const resolvedStyle = useExportWatermarkStyle(style);
  const { theme } = useUniwind();
  const { t } = useTranslation();
  const [background, foreground, brandColor] = useThemeColor([
    surface === 'card' ? 'card' : 'constant-white',
    surface === 'card' ? 'foreground' : 'constant-black',
    'brand',
  ]);
  const logoDataUrl = EXPORT_BRAND_LOGOS[surface === 'card' && theme === 'dark' ? 'dark' : 'light'];
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
            logoDataUrl,
            background,
            foreground,
            brandColor,
            downloadLabel: t(
              surface === 'card'
                ? 'fileExport.watermark.scanToDownload'
                : 'fileExport.watermark.download',
            ),
            downloadLinkLabel: t('fileExport.watermark.downloadLink'),
          },
        };
    }
  }, [resolvedStyle, background, foreground, brandColor, logoDataUrl, surface, t]);
}
