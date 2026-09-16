import { useMemo } from 'react';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportSignature } from '@/shared/contracts/documentExport';

import { EXPORT_BRAND } from './exportBrand';

export function useExportSignature(): Omit<ExportSignature, 'timestamp'> {
  const [background, foreground] = useThemeColor(['constant-white', 'constant-black']);
  // Document capture observes this value; unrelated screen renders must not restart it.
  return useMemo(() => ({ ...EXPORT_BRAND, background, foreground }), [background, foreground]);
}
