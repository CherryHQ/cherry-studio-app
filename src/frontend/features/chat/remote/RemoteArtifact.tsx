import { FileAttachmentPreview, Skeleton, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRemoteAgent, useRemoteConnection } from '@/frontend/appShell/remoteAgent';
import {
  FileEntryImage,
  fileEntryPreviewKind,
  useOpenFileEntry,
} from '@/frontend/components/FileEntryPreview';
import { filenameExtension } from '@/shared/data/types/file';

export function RemoteArtifact({
  name,
  mediaType,
  resource,
}: {
  name: string;
  mediaType?: string;
  resource: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const { openFileEntry } = useOpenFileEntry();
  const mounted = useRef(true);
  const [progress, setProgress] = useState(0);
  const isImage = fileEntryPreviewKind({ mediaType: mediaType ?? '' }) === 'image';
  const canDownload = connection.capabilities.artifacts && connection.status === 'ready';
  const file = useQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'artifact', resource],
    queryFn: ({ signal }) => {
      setProgress(0);
      return controller.download(resource, signal, (received, total) => {
        if (!signal.aborted) setProgress(total ? Math.round((received * 100) / total) : 100);
      });
    },
    enabled: isImage && canDownload,
    networkMode: 'always',
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const open = async () => {
    if (file.isFetching || (!file.data && !canDownload)) return;
    const resolved = file.data ?? (await file.refetch()).data;
    // Query cancellation owns the transfer; leaving the row also cancels the open intent.
    if (!mounted.current) return;
    if (resolved) {
      openFileEntry(resolved);
    } else {
      toast.show({ label: t('remoteAgent.downloadFailed'), variant: 'danger' });
    }
  };

  if (file.data && fileEntryPreviewKind(file.data.entry) === 'image') {
    return <FileEntryImage entry={file.data.entry} uri={file.data.uri} />;
  }
  if (isImage && file.isFetching) {
    return <Skeleton className="aspect-square w-full rounded-xl" />;
  }

  return (
    <FileAttachmentPreview
      categoryLabel={
        file.isFetching
          ? t('remoteAgent.downloading', { progress })
          : file.isError
            ? t('remoteAgent.downloadFailed')
            : t('filePreview.document')
      }
      disabled={file.isFetching || (!file.data && !canDownload)}
      file={{
        displayName: name || t('remoteAgent.artifact'),
        extensionLabel: filenameExtension(name)?.slice(0, 5).toUpperCase() ?? '',
      }}
      labels={{ openWith: t('filePreview.openWith'), unavailable: t('filePreview.unavailable') }}
      onPress={() => void open()}
    />
  );
}
