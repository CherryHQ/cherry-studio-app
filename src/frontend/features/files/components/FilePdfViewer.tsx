import { ContentState } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, UIManager, View } from 'react-native';
import PdfRendererView from 'react-native-pdf-renderer';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ResolvedFile } from '@/shared/contracts/file';

import { FileViewerHeader } from './FileViewerHeader';

export function FilePdfViewer({ file }: { file: ResolvedFile }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <FileViewerHeader file={file} />
      <PdfBody file={file} key={attempt} onRetry={() => setAttempt((value) => value + 1)} />
    </>
  );
}

function PdfBody({ file, onRetry }: { file: ResolvedFile; onRetry: () => void }) {
  const { t } = useTranslation();
  const background = useThemeColor('background');
  const available = UIManager.hasViewManagerConfig('RNPdfRendererView');
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState<{ current: number; total: number }>();
  const loading = available && !failed && !page;

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => setFailed(true), 30_000);
    return () => clearTimeout(timeout);
  }, [loading]);

  if (!available || failed) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ContentState.Error
          description={t('fileViewer.readFailedDescription')}
          primaryAction={{ children: t('common.retry'), onPress: onRetry }}
          title={t('fileViewer.previewFailed')}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 pb-safe">
      <View className="flex-1">
        <PdfRendererView
          maxPageResolution={2048}
          maxZoom={5}
          onError={() => setFailed(true)}
          onPageChange={(current, total) => {
            if (current >= 0 && current < total) {
              setPage((previous) =>
                previous?.current === current + 1 && previous.total === total
                  ? previous
                  : { current: current + 1, total },
              );
            }
          }}
          source={file.uri}
          style={{ backgroundColor: background }}
        />
        {loading ? (
          <View className="absolute inset-0 items-center justify-center bg-background p-6">
            <ContentState.Loading title={t('fileViewer.loading')} />
          </View>
        ) : null}
      </View>
      {page ? (
        <Text className="px-4 py-2 text-center text-sm text-muted-foreground">
          {t('fileViewer.pagePosition', page)}
        </Text>
      ) : null}
    </View>
  );
}
