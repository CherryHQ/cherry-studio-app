import FolderOpenIcon from '@cherrystudio/app-icons/icons/folder-open';
import { ContentState } from '@cherrystudio/ui/components';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';

import { type HeaderToolbarAction, RouteHeader } from '@/frontend/appShell/header';
import SidebarExpandIcon from '@/frontend/appShell/icons/SidebarExpandIcon';
import { isAcross, PaneChromeProvider, useFoldRegion } from '@/frontend/appShell/layout';
import {
  FILES_MASTER_WIDTH,
  useNavigationShell,
  useReportMiddleColumnWidth,
  WIDE_RAIL_WIDTH,
} from '@/frontend/appShell/navigationShell/state';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import {
  LibraryMasterDetailContext,
  type LibraryMasterDetailState,
} from './LibraryMasterDetailContext';

type LibraryMasterDetailHostProps = {
  library: ReactNode;
  renderPreview: (fileEntryId: string) => ReactNode;
};

/**
 * Scheme A wide Files Master-Detail layout:
 * - Compact / vertical-rail: renders the standalone file library stack screen.
 * - Wide rail: permanent collapsible left master list (`288pt`) + right live preview pane,
 *   removing the redundant root back button and legacy chat-split controls.
 */
export function LibraryMasterDetailHost({
  library,
  renderPreview,
}: LibraryMasterDetailHostProps): ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fold = useFoldRegion();
  const { theme } = useUniwind();
  const [backgroundColor, sidebarColor, sidebarBorderColor] = useThemeColor([
    'background',
    'sidebar',
    'sidebar-border',
  ]);
  const { isFileListCollapsed, shellMode, toggleFileListCollapsed } = useNavigationShell();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const isMasterDetail = shellMode === 'wide-rail';
  const masterWidth =
    !isMasterDetail || isFileListCollapsed
      ? 0
      : fold && !isAcross(fold)
        ? Math.max(240, fold.x - WIDE_RAIL_WIDTH)
        : FILES_MASTER_WIDTH;

  useReportMiddleColumnWidth('files', masterWidth);

  const contextValue = useMemo<LibraryMasterDetailState>(
    () => ({
      isListCollapsed: isFileListCollapsed,
      isMasterDetail,
      selectFile: setSelectedFileId,
      selectedFileId,
      toggleListCollapsed: toggleFileListCollapsed,
    }),
    [isFileListCollapsed, isMasterDetail, selectedFileId, toggleFileListCollapsed],
  );

  const toggleAction = useMemo<HeaderToolbarAction>(
    () => ({
      accessibilityLabel: t('navigation.toggleFileList'),
      icon: SidebarExpandIcon,
      key: 'files-master-toggle',
      onPress: toggleFileListCollapsed,
      testID: 'files-master-toggle',
      type: 'icon',
    }),
    [t, toggleFileListCollapsed],
  );

  const leadingToggleAction = fold && !isAcross(fold) ? undefined : toggleAction;
  const paneInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  if (!isMasterDetail) {
    return <LibraryMasterDetailContext value={contextValue}>{library}</LibraryMasterDetailContext>;
  }

  return (
    <LibraryMasterDetailContext value={contextValue}>
      <SafeAreaInsetsContext value={paneInsets}>
        <View className="bg-background flex-1 flex-row" testID="files-master-detail">
          {!isFileListCollapsed ? (
            <View
              className="h-full shrink-0"
              style={{
                backgroundColor: theme === 'dark' ? sidebarColor : backgroundColor,
                borderEndColor: sidebarBorderColor,
                borderEndWidth: StyleSheet.hairlineWidth,
                paddingTop: insets.top,
                width: masterWidth,
              }}
              testID="files-master-column"
            >
              <PaneChromeProvider leadingAction={undefined} titleAlign="left">
                {library}
              </PaneChromeProvider>
            </View>
          ) : null}

          <View
            className="bg-background min-w-0 flex-1"
            style={{ paddingTop: insets.top }}
            testID="files-detail-column"
          >
            <PaneChromeProvider leadingAction={leadingToggleAction}>
              {selectedFileId ? renderPreview(selectedFileId) : <FilesMasterEmptyState />}
            </PaneChromeProvider>
          </View>
        </View>
      </SafeAreaInsetsContext>
    </LibraryMasterDetailContext>
  );
}

function FilesMasterEmptyState() {
  const { t } = useTranslation();

  return (
    <View className="bg-background flex-1">
      <RouteHeader title="" />
      <View className="flex-1 items-center justify-center p-6">
        <ContentState.Empty
          icon={
            <ContentState.Icon>
              <FolderOpenIcon className="text-muted-foreground size-8" />
            </ContentState.Icon>
          }
          title={t('navigation.filesEmptySelection')}
        />
      </View>
    </View>
  );
}
