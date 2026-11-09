import { resolveTypographyScale } from '@cherrystudio/ui/utils';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useExportWatermark } from '@/frontend/appShell/fileExport';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportPresentation } from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { IMAGE_LAYOUT_WIDTH } from '../utils/imagePagePlan';

export function useExportPresentation(
  watermark: ExportWatermarkStyle,
  isImage: boolean,
  isMessageCard: boolean,
) {
  const { t } = useTranslation();
  const label = t('documentExport.document');
  const excerptLabel = t('sharing.imageExcerpt');
  const [fontStep] = usePreference('ui.font_size_step');
  const [typography] = useState(() => {
    const { base, sm, lg, xl } = resolveTypographyScale(fontStep);
    return { base, sm, lg, xl };
  });
  const createWatermark = useExportWatermark(
    watermark,
    isImage && isMessageCard ? 'card' : 'white',
  );
  const [
    background,
    foreground,
    muted,
    tertiary,
    border,
    subtleBorder,
    link,
    bubble,
    secondary,
    codeBlock,
    inlineCode,
    inlineCodeForeground,
  ] = useThemeColor([
    'card',
    'foreground',
    'muted-foreground',
    'foreground-tertiary',
    'border',
    'border-subtle',
    'link',
    'chat-user',
    'secondary',
    'code-block',
    'inline-code',
    'inline-code-foreground',
  ]);
  return useMemo<ExportPresentation>(
    () => ({
      width: isImage ? IMAGE_LAYOUT_WIDTH : 720,
      typography,
      watermark: createWatermark(),
      imageFrame: isImage
        ? { background, label, layout: isMessageCard ? 'single' : 'pages', excerptLabel }
        : undefined,
      colors: {
        background,
        foreground,
        muted,
        tertiary,
        border,
        subtleBorder,
        link,
        bubble,
        secondary,
        codeBlock,
        inlineCode,
        inlineCodeForeground,
      },
    }),
    [
      background,
      border,
      bubble,
      codeBlock,
      createWatermark,
      excerptLabel,
      foreground,
      inlineCode,
      inlineCodeForeground,
      isImage,
      isMessageCard,
      label,
      link,
      muted,
      secondary,
      subtleBorder,
      tertiary,
      typography,
    ],
  );
}
