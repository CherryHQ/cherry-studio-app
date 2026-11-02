import { resolveTypographyScale } from '@cherrystudio/ui/utils';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useExportWatermark } from '@/frontend/appShell/fileExport';
import { usePreference } from '@/frontend/data';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ExportPresentation } from '@/shared/contracts/documentExport';
import type { ExportWatermarkStyle } from '@/shared/contracts/fileExport';

import { IMAGE_LAYOUT_WIDTH } from './export/utils/imagePagePlan';

export function useChatSharePresentation(watermark: ExportWatermarkStyle) {
  const { t } = useTranslation();
  const [fontStep] = usePreference('ui.font_size_step');
  const [typography] = useState(() => {
    const { base, sm, lg, xl } = resolveTypographyScale(fontStep);
    return { base, sm, lg, xl };
  });
  const createWatermark = useExportWatermark(watermark);
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
    'background',
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
  // Native capture observes these identities; unrelated sheet updates must not restart rendering.
  const document = useMemo<ExportPresentation>(
    () => ({
      width: 720,
      typography,
      watermark: createWatermark(),
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
      typography,
      createWatermark,
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
    ],
  );
  const image = useMemo<ExportPresentation>(
    () => ({
      ...document,
      width: IMAGE_LAYOUT_WIDTH,
      imageFrame: { background, label: t('documentExport.conversation') },
    }),
    [document, background, t],
  );
  return { document, image };
}
