import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import { isAcross, useFoldRegion, useWindowClass } from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import type { FileEntryId } from '@/shared/data/types/file';

export type FilePaneFile = { entryId: FileEntryId; imageEditRequestId?: string };

export type FilePane = {
  /** The window and chat source can show files beside the current chat. */
  isAvailable: boolean;
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
};

const FilePaneContext = createContext<FilePane | null>(null);

/**
 * Owns the file pane beside chat for the drawer group, so the sidebar and chat reach the same
 * state. Routes pushed over the drawer have no pane and keep opening their own pages.
 */
export function FilePaneProvider({ children }: PropsWithChildren) {
  const windowClass = useWindowClass();
  const fold = useFoldRegion();
  // The library manages this phone's files; a desktop source has none to show.
  const isLocal = useChatSource().source === 'local';
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<FilePaneFile | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  // An upright foldable is narrow but tall enough to stack the pane above the chat.
  const isAvailable = isLocal && (windowClass !== 'compact' || (fold !== null && isAcross(fold)));

  const value = useMemo<FilePane>(
    () => ({
      isAvailable,
      isOpen,
      file,
      isExpanded,
      open: () => setIsOpen(true),
      // Leaving the preview always returns the chat to its place beside the pane.
      close: () => {
        setIsOpen(false);
        setIsExpanded(false);
      },
      openFile: (next) => {
        setFile(next);
        setIsOpen(true);
      },
      closeFile: () => {
        setFile(null);
        setIsExpanded(false);
      },
      setExpanded: setIsExpanded,
    }),
    [file, isAvailable, isExpanded, isOpen],
  );

  return <FilePaneContext value={value}>{children}</FilePaneContext>;
}

/** The pane for the current drawer group, or null on routes pushed over it. */
export function useFilePane() {
  return use(FilePaneContext);
}
