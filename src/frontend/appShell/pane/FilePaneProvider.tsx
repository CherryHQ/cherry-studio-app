import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import {
  isAcross,
  useFoldRegion,
  useIsFoldRegionLayoutCurrent,
  useWindowClass,
} from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import type { FileEntryId } from '@/shared/data/types/file';

export type FilePaneFile = { entryId: FileEntryId; imageEditRequestId?: string };

export type FilePane = {
  /** The window and chat source can show files beside the current chat. */
  isAvailable: boolean;
  /**
   * The window narrowed while this preview was in use, so it stays expanded over the chat until
   * the user returns to the chat or the window can hold the pane again.
   */
  isCarried: boolean;
  isOpen: boolean;
  file: FilePaneFile | null;
  /** A preview fills the chat's space; the chat stays mounted behind it. */
  isExpanded: boolean;
  open: () => void;
  /** Hides the pane; its list place and open file come back with it. */
  close: () => void;
  openFile: (file: FilePaneFile) => void;
  /** Returns from a preview to the list it was opened from. */
  closeFile: () => void;
  setExpanded: (isExpanded: boolean) => void;
  /** Touches, including document scrolling, select which region a narrower window keeps. */
  recordTouch: (region: TouchRegion) => void;
};

type TouchRegion = 'pane' | 'chat';

const FilePaneContext = createContext<FilePane | null>(null);

/**
 * Owns the file pane beside chat for the drawer group, so the sidebar and chat reach the same
 * state. Routes pushed over the drawer have no pane and keep opening their own pages.
 */
export function FilePaneProvider({ children }: PropsWithChildren) {
  const windowClass = useWindowClass();
  const fold = useFoldRegion();
  const isLayoutCurrent = useIsFoldRegionLayoutCurrent();
  // The library manages this phone's files; a desktop source has none to show.
  const isLocal = useChatSource().source === 'local';
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<FilePaneFile | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastTouched, setLastTouched] = useState<TouchRegion>('chat');
  // The expanded state to restore when a carried preview returns beside the chat.
  const [carried, setCarried] = useState<{ wasExpanded: boolean } | null>(null);
  // A narrow window folded across its middle is tall enough to stack the pane above the chat.
  const isAvailable = isLocal && (windowClass !== 'compact' || (fold !== null && isAcross(fold)));

  // Availability only changes on a current snapshot, so a rotation's stale fold cannot carry.
  const [settledAvailable, setSettledAvailable] = useState(isAvailable);
  if (isLayoutCurrent && settledAvailable !== isAvailable) {
    setSettledAvailable(isAvailable);
    if (!isAvailable && isLocal && isOpen && file && lastTouched === 'pane') {
      setCarried({ wasExpanded: isExpanded });
      setIsExpanded(true);
    } else if (isAvailable && carried) {
      setCarried(null);
      setIsExpanded(carried.wasExpanded);
    }
  }

  const value = useMemo<FilePane>(() => {
    // Leaving a carried preview returns to the chat and keeps the file for the wider window.
    const leaveCarried = () => {
      if (!carried) return false;
      setCarried(null);
      setIsExpanded(carried.wasExpanded);
      return true;
    };
    return {
      isAvailable,
      isCarried: carried !== null,
      isOpen,
      file,
      isExpanded,
      open: () => setIsOpen(true),
      // Leaving the preview always returns the chat to its place beside the pane.
      close: () => {
        setCarried(null);
        setIsOpen(false);
        setIsExpanded(false);
      },
      openFile: (next) => {
        setFile(next);
        setIsOpen(true);
      },
      closeFile: () => {
        if (leaveCarried()) return;
        setFile(null);
        setIsExpanded(false);
      },
      setExpanded: (next) => {
        if (!next && leaveCarried()) return;
        if (next) setLastTouched('pane');
        setIsExpanded(next);
      },
      recordTouch: setLastTouched,
    };
  }, [carried, file, isAvailable, isExpanded, isOpen]);

  return <FilePaneContext value={value}>{children}</FilePaneContext>;
}

/** The pane for the current drawer group, or null on routes pushed over it. */
export function useFilePane() {
  return use(FilePaneContext);
}
