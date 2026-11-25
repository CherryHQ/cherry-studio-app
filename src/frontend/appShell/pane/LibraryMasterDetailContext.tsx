import { createContext, use } from 'react';

export type LibraryMasterDetailState = {
  isListCollapsed: boolean;
  isMasterDetail: boolean;
  selectFile: (fileEntryId: string | null) => void;
  selectedFileId: string | null;
  toggleListCollapsed: () => void;
};

export const LibraryMasterDetailContext = createContext<LibraryMasterDetailState | null>(null);

export function useLibraryMasterDetail(): LibraryMasterDetailState | null {
  return use(LibraryMasterDetailContext);
}
