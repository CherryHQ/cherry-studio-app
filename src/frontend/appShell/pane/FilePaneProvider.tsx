import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import { useWindowClass } from '@/frontend/appShell/layout';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import type { FileEntryId } from '@/shared/data/types/file';

export type FilePaneFile = { entryId: FileEntryId; imageEditRequestId?: string };

export type FilePane = {
  /** The window and chat source can show files beside the current chat. */
  isAvailable: boolean;
  isOpen: boolean;
  file: FilePaneFile | null;
  open: () => void;
  /** Hides the pane; its list place and open file come back with it. */
  close: () => void;
  openFile: (file: FilePaneFile) => void;
  /** Returns from a preview to the list it was opened from. */
  closeFile: () => void;
};

const FilePaneContext = createContext<FilePane | null>(null);

/**
 * Owns the file pane beside chat for the drawer group, so the sidebar and chat reach the same
 * state. Routes pushed over the drawer have no pane and keep opening their own pages.
 */
export function FilePaneProvider({ children }: PropsWithChildren) {
  const windowClass = useWindowClass();
  // The library manages this phone's files; a desktop source has none to show.
  const isLocal = useChatSource().source === 'local';
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<FilePaneFile | null>(null);
  const isAvailable = windowClass !== 'compact' && isLocal;

  const value = useMemo<FilePane>(
    () => ({
      isAvailable,
      isOpen,
      file,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      openFile: (next) => {
        setFile(next);
        setIsOpen(true);
      },
      closeFile: () => setFile(null),
    }),
    [file, isAvailable, isOpen],
  );

  return <FilePaneContext value={value}>{children}</FilePaneContext>;
}

/** The pane for the current drawer group, or null on routes pushed over it. */
export function useFilePane() {
  return use(FilePaneContext);
}
