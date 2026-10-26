import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useKeyboardState, useReanimatedFocusedInput } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';
import { FoldRegionReporter, PaneChromeProvider, type PaneSplit } from '@/frontend/appShell/layout';

import { type FilePane, type FilePaneFile, useFilePane } from './FilePaneProvider';
import { useFilePaneTransition } from './useFilePaneTransition';
import { usePaneSplit } from './usePaneSplit';

type FilePaneContent = {
  library: ReactNode;
  renderFile: (file: FilePaneFile) => ReactNode;
};

/**
 * Lays the file pane out beside the chat stack whenever the drawer group provides one. On a
 * foldable the pane and chat meet at the fold instead of spanning it.
 */
export function FilePaneHost({ children, ...content }: FilePaneContent & { children: ReactNode }) {
  const pane = useFilePane();
  const { chatTop, isLayoutCurrent, measure, split } = usePaneSplit();
  const isTypingInChat = useIsTypingBelow(chatTop);
  // An expanded preview covers the chat; only assistive technologies need to be told.
  const isChatCovered = Boolean(
    isLayoutCurrent &&
    (pane?.isAvailable || pane?.isCarried) &&
    pane.isOpen &&
    pane.file &&
    pane.isExpanded,
  );

  return (
    <View className={split.direction === 'row' ? 'flex-1 flex-row' : 'flex-1'} onLayout={measure}>
      <FoldRegionReporter />
      {pane ? (
        <FilePaneColumn
          isLayoutCurrent={isLayoutCurrent}
          isYielding={isTypingInChat}
          pane={pane}
          split={split}
          {...content}
        />
      ) : null}
      <View
        accessibilityElementsHidden={isChatCovered}
        className="flex-1"
        importantForAccessibility={isChatCovered ? 'no-hide-descendants' : 'auto'}
        onTouchStart={() => pane?.recordTouch('chat')}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Whether the keyboard serves an input below `top`. Stacked on a foldable, the keyboard fills the
 * half below the fold, so while the chat is typed into it takes the window and keeps its composer
 * above the keyboard. The answer holds until the keyboard closes, because the composer then moves.
 */
function useIsTypingBelow(top: number | null) {
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const { input } = useReanimatedFocusedInput();
  const [typing, setTyping] = useState({ isKeyboardVisible, isBelow: false });
  if (typing.isKeyboardVisible !== isKeyboardVisible) {
    // Only a stacked split needs the input's position, read once as the keyboard opens.
    const inputY = isKeyboardVisible && top !== null ? input.get()?.layout.absoluteY : undefined;
    setTyping({
      isBelow: inputY !== undefined && top !== null && inputY >= top,
      isKeyboardVisible,
    });
  }
  return typing.isBelow && top !== null;
}

/**
 * Stays mounted once opened, so hiding the pane, previewing a file, or a narrower window does not
 * lose the list's mode, folder, or scroll position.
 */
function FilePaneColumn({
  isLayoutCurrent,
  isYielding,
  library,
  pane,
  renderFile,
  split,
}: FilePaneContent & {
  isLayoutCurrent: boolean;
  isYielding: boolean;
  pane: FilePane;
  split: PaneSplit;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { close, closeFile, file, isExpanded, setExpanded } = pane;
  const isRow = split.direction === 'row';
  const {
    hasSpace,
    isVisible,
    style: transitionStyle,
  } = useFilePaneTransition(
    (pane.isAvailable && pane.isOpen) || pane.isCarried,
    isYielding,
    !isRow,
    isLayoutCurrent,
  );
  const [isMounted, setIsMounted] = useState(isVisible);
  if (isVisible && !isMounted) setIsMounted(true);

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

  const readingAction = useMemo<HeaderToolbarAction>(
    () =>
      isExpanded
        ? {
            key: 'file-pane-return',
            label: t('filePane.returnToChat'),
            onPress: () => setExpanded(false),
            testID: 'file-pane-return',
            type: 'label',
          }
        : {
            accessibilityLabel: t('filePane.expand'),
            icon: Maximize2Icon,
            key: 'file-pane-expand',
            onPress: () => setExpanded(true),
            testID: 'file-pane-expand',
            type: 'icon',
          },
    [isExpanded, setExpanded, t],
  );

  // Android back returns an expanded preview beside the chat, then leaves the preview, then the pane.
  useEffect(() => {
    if (!isVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (file && isExpanded) setExpanded(false);
      else if (file) closeFile();
      else close();
      return true;
    });
    return () => subscription.remove();
  }, [close, closeFile, file, isExpanded, isVisible, setExpanded]);

  if (!isMounted) return null;

  // `display: none` would discard the pane's native views and with them its scroll and document
  // state, so a hidden pane stays laid out but transparent, and a spacer holds its place before
  // the chat, including any fold between them.
  return (
    <>
      {/* A carried preview covers the chat, which keeps the full width of the narrow window. */}
      {hasSpace && !pane.isCarried ? (
        <View style={isRow ? { width: split.chatOffset } : { height: split.chatOffset }} />
      ) : null}
      <Animated.View
        accessibilityElementsHidden={!isVisible}
        className="border-border bg-background"
        importantForAccessibility={isVisible ? 'auto' : 'no-hide-descendants'}
        onTouchStart={() => pane.recordTouch('pane')}
        pointerEvents={isVisible ? 'auto' : 'none'}
        style={[
          styles.pane,
          { paddingTop: insets.top },
          file && isExpanded
            ? styles.expanded
            : isRow
              ? [styles.row, { width: split.paneSize }]
              : [styles.column, { height: split.paneSize }],
          transitionStyle,
        ]}
        testID="file-pane"
      >
        <PaneChromeProvider leadingAction={closeAction}>{library}</PaneChromeProvider>
        {file ? (
          <View
            className="bg-background"
            style={[StyleSheet.absoluteFill, { paddingTop: insets.top }]}
          >
            <PaneChromeProvider headerAction={readingAction} leadingAction={backAction}>
              {renderFile(file)}
            </PaneChromeProvider>
          </View>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  column: { borderBottomWidth: StyleSheet.hairlineWidth, end: 0 },
  // Covers the chat, which keeps its size, draft, and scroll position underneath.
  expanded: { bottom: 0, end: 0 },
  pane: { position: 'absolute', start: 0, top: 0, zIndex: 1 },
  row: { borderEndWidth: StyleSheet.hairlineWidth, bottom: 0 },
});
