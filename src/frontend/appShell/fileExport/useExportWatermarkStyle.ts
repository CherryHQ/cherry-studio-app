import { usePreference } from '@/frontend/data/hooks';
import {
  DEFAULT_EXPORT_WATERMARK_STYLE,
  type ExportWatermarkStyle,
} from '@/shared/contracts/fileExport';

export function useExportWatermarkStyle(style?: ExportWatermarkStyle): ExportWatermarkStyle {
  const [isEnabled] = usePreference('file.export.watermark_enabled');
  return style ?? (isEnabled ? DEFAULT_EXPORT_WATERMARK_STYLE : 'none');
}
