import { ProviderModelListContent } from './ProviderModelListContent';
import type { ProviderModelListLayoutProps } from './providerModelListLayout.types';
import { ProviderModelSearchField } from './ProviderModelSearchField';

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
