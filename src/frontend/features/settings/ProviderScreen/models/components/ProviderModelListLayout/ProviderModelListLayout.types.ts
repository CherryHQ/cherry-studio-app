import type { ProviderModelListContentProps } from '../ProviderModelListContent';
import type { ProviderModelSearchFieldProps } from '../ProviderModelSearchField/ProviderModelSearchField.types';

export type ProviderModelListLayoutProps = Omit<
  ProviderModelListContentProps,
  'ListHeaderComponent'
> &
  ProviderModelSearchFieldProps & {
    showSearch: boolean;
  };
