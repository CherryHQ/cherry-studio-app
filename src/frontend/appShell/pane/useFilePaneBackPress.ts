import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

import type { FilePane } from './FilePaneProvider';

/**
 * Android back returns an expanded preview beside the chat, then leaves the preview, then the pane.
 * A route pushed over the chat, such as the trash opened from the pane, keeps the pane mounted
 * underneath, so back belongs to the pane only while the chat is focused.
 */
export function useFilePaneBackPress(pane: FilePane, isVisible: boolean) {
  const { close, closeFile, file, isExpanded, setExpanded } = pane;
  useFocusEffect(
    useCallback(() => {
      if (!isVisible) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (file && isExpanded) setExpanded(false);
        else if (file) closeFile();
        else close();
        return true;
      });
      return () => subscription.remove();
    }, [close, closeFile, file, isExpanded, isVisible, setExpanded]),
  );
}
