import { ModelSearchField } from '@/frontend/components/modelPicker';

import { ProviderModelListContent } from '../ProviderModelListContent';
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
        <ModelSearchField searchText={searchText} setSearchText={setSearchText} />
      ) : null}
      <ProviderModelListContent {...listProps} />
    </>
  );
}
