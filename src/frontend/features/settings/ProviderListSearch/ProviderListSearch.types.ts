import type { ReactNode } from 'react';

export type ProviderListSearchProps = {
  children: ReactNode;
  searchText: string;
  setSearchText: (value: string) => void;
};
