import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  PaneChromeProvider,
  resolveFilePaneWidth,
  useIsSidebarPersistent,
  windowRegionWidths,
} from '@/frontend/appShell/layout';

import { type FilePane, type FilePaneFile, useFilePane } from './FilePaneProvider';

type FilePaneContent = {
  library: ReactNode;
  renderFile: (file: FilePaneFile) => ReactNode;
};

/** Lays the file pane out beside the chat stack whenever the drawer group provides one. */
export function FilePaneHost({ children, ...content }: FilePaneContent & { children: ReactNode }) {
  const pane = useFilePane();

  return (
    <View className="flex-1 flex-row">
      {pane ? <FilePaneColumn pane={pane} {...content} /> : null}
      <View className="flex-1">{children}</View>
    </View>
  );
}

/**
 * Stays mounted once opened, so hiding the pane, previewing a file, or a narrower window does not
 * lose the list's mode, folder, or scroll position.
 */
function FilePaneColumn({ library, pane, renderFile }: FilePaneContent & { pane: FilePane }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSidebarPersistent = useIsSidebarPersistent();
  const { close, closeFile, file } = pane;
  const isVisible = pane.isAvailable && pane.isOpen;
  const [isMounted, setIsMounted] = useState(isVisible);
  if (isVisible && !isMounted) setIsMounted(true);

  const sidebarWidth = isSidebarPersistent ? windowRegionWidths.sidebar : 0;
  const paneWidth = resolveFilePaneWidth(width - insets.left - insets.right - sidebarWidth);
  const closeAction = useMemo<HeaderToolbarAction>(
    () => ({
      accessibilityLabel: t('common.close'),
      icon: XIcon,
      key: 'file-pane-close',
      onPress: close,
      testID: 'file-pane-close',
      type: 'icon',
    }),
    [close, t],
  );
  const backAction = useMemo<HeaderToolbarAction>(
    () => ({
      accessibilityLabel: t('navigation.back'),
      icon: ArrowLeftIcon,
      key: 'file-pane-back',
      onPress: closeFile,
      testID: 'file-pane-back',
      type: 'icon',
    }),
    [closeFile, t],
  );

  // Android back leaves the preview first, then the pane.
  useEffect(() => {
    if (!isVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (file) closeFile();
      else close();
      return true;
    });
    return () => subscription.remove();
  }, [close, closeFile, file, isVisible]);

  if (!isMounted) return null;

  // `display: none` would discard the pane's native views and with them its scroll and document
  // state, so a hidden pane stays laid out but transparent, and a spacer holds its place in the row.
  return (
    <>
      {isVisible ? <View style={{ width: paneWidth }} /> : null}
      <View
        accessibilityElementsHidden={!isVisible}
        className="border-border bg-background"
        importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.pane,
          { paddingTop: insets.top, width: paneWidth },
          !isVisible && styles.hidden,
        ]}
        testID="file-pane"
      >
        <PaneChromeProvider leadingAction={closeAction}>{library}</PaneChromeProvider>
        {file ? (
          <View
            className="bg-background"
            style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]}
          >
            <PaneChromeProvider leadingAction={backAction}>{renderFile(file)}</PaneChromeProvider>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0, pointerEvents: 'none' },
  pane: {
    borderEndWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    position: 'absolute',
    start: 0,
    top: 0,
  },
});
