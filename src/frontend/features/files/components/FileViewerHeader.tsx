import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderChrome, useRouteHeaderLeadingAction } from '@/frontend/appShell/header';
import { useShareFile } from '@/frontend/appShell/sharing';
import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview/utils/fileEntryPresentation';
import { PublishSiteSheet } from '@/frontend/components/PublishSite';
import { usePluginConnections } from '@/frontend/hooks/plugin/usePluginConnections';
import { readFileText } from '@/frontend/utils/readFileText';

import type { FileViewerSource } from '../fileViewerSource';

const EMPTY_ITEMS: readonly MenuItem[] = [];

export function FileViewerHeader({
  file,
  items = EMPTY_ITEMS,
}: {
  file: FileViewerSource;
  items?: readonly MenuItem[];
}) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction();
  const { openFileEntryWithSystem } = useOpenFileEntry();
  const { isSharing, share } = useShareFile(file.kind === 'managed' ? file : undefined);
  const [publishOpen, setPublishOpen] = useState(false);
  const { data: connections } = usePluginConnections();
  const githubConnected = Boolean(
    connections?.some((c) => c.pluginId === 'github' && c.authorization?.status === 'connected'),
  );
  const isHtml =
    file.entry.mediaType === 'text/html' || fileEntryPreviewKind(file.entry) === 'html';

  const menuItems: MenuItem[] = [
    ...items,
    ...(file.kind === 'managed'
      ? [
          {
            disabled: isSharing,
            id: 'share',
            label: t('fileViewer.share'),
            onPress: () => void share(),
          },
        ]
      : []),
    ...(isHtml && file.kind === 'managed'
      ? [
          {
            id: 'publish',
            label: t('publishSite.title'),
            onPress: () => setPublishOpen(true),
          },
        ]
      : []),
    {
      id: 'open-with',
      label: t('filePreview.openWith'),
      onPress: () => void openFileEntryWithSystem(file),
    },
  ];

  return (
    <>
      <HeaderChrome
        leftActions={leadingAction ? [leadingAction] : []}
        rightActions={[
          {
            accessibilityLabel: t('common.more'),
            icon: EllipsisIcon,
            items: menuItems,
            key: 'more',
            nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
            type: 'menu',
          },
        ]}
        title={file.entry.filename}
        titleAlign="center"
      />
      {publishOpen && file.kind === 'managed' ? (
        <PublishSiteSheet
          connected={githubConnected}
          html={readFileText(file.uri).text}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}
    </>
  );
}
