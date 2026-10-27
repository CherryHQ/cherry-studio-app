import { useFocusedBackPress } from '@/frontend/appShell/navigation';

import type { FilePane } from './FilePaneProvider';

/**
 * Android back returns an expanded preview beside the chat, then leaves the preview, then the pane.
 * A route pushed over the chat, such as the trash opened from the pane, keeps back for itself.
 */
export function useFilePaneBackPress(pane: FilePane, isVisible: boolean) {
  const { close, closeFile, file, isExpanded, setExpanded } = pane;
  useFocusedBackPress(() => {
    if (file && isExpanded) setExpanded(false);
    else if (file) closeFile();
    else close();
  }, isVisible);
}
