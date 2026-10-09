import { useTranslation } from 'react-i18next';

import { ArtifactImagePages } from '@/frontend/components/ArtifactPreview';
import type { DocumentExportArtifact } from '@/shared/contracts/documentExport';

export function DocumentExportImagePreview({
  artifact,
  onError,
  width,
}: {
  artifact: Extract<DocumentExportArtifact, { format: 'image' }>;
  onError(): void;
  width: number;
}) {
  const { t } = useTranslation();
  return (
    <ArtifactImagePages
      images={artifact.pages.map((page, index) => ({
        uri: page.file.uri,
        width: page.width,
        height: page.height,
        label: t('documentExport.page', { page: index + 1, total: artifact.pages.length }),
      }))}
      onError={onError}
      width={width}
    />
  );
}
