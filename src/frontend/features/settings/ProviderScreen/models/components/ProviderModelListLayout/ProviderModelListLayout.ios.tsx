import { ProviderModelListContent } from '../ProviderModelListContent';
import { ProviderModelSearchField } from '../ProviderModelSearchField/ProviderModelSearchField';
import type { ProviderModelListLayoutProps } from './ProviderModelListLayout.types';

export function ProviderModelListLayout({
  searchText,
  setSearchText,
  showSearch,
  ...listProps
}: ProviderModelListLayoutProps) {
  return (
    <>
      {showSearch ? (
        <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
      ) : null}
      <ProviderModelListContent {...listProps} />
    </>
  );
}
