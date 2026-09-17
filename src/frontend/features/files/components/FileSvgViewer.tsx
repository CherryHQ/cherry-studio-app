import { ContentState } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { queryKeys } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { readSvgPreview } from '../utils/readSvgPreview';
import { FileSvgBody } from './FileSvgBody';
import { FileViewerHeader } from './FileViewerHeader';

const logger = loggerService.withContext('FileSvgViewer');

export function FileSvgViewer({ file }: { file: ResolvedFile }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const query = useQuery({
    gcTime: 0,
    networkMode: 'always',
    queryKey: queryKeys.files.viewerSvg(file.entry, file.uri),
    queryFn: async ({ signal }) => {
      try {
        return await readSvgPreview(file.uri, signal);
      } catch (error) {
        if (!signal.aborted)
          logger.warn('SVG preview failed', error as Error, { entryId: file.entry.id });
        throw error;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
  const content = query.data;

  return (
    <>
      <FileViewerHeader file={file} />
      {query.isPending ? (
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Loading title={t('fileViewer.loading')} />
        </View>
      ) : !content || failed ? (
        <View className="flex-1 items-center justify-center p-6">
          <ContentState.Error
            description={t('fileViewer.readFailedDescription')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => {
                setFailed(false);
                setAttempt((value) => value + 1);
                if (!content) void query.refetch();
              },
            }}
            title={t('fileViewer.previewFailed')}
          />
        </View>
      ) : (
        <View className="flex-1 pb-safe">
          <FileSvgBody data={content} key={attempt} onFailure={() => setFailed(true)} />
        </View>
      )}
    </>
  );
}
