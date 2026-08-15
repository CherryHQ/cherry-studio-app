import type { ProviderModelListContentProps } from './ProviderModelListContent';
import type { ProviderModelSearchFieldProps } from './providerModelSearchField.types';

export type ProviderModelListLayoutProps = Omit<
  ProviderModelListContentProps,
  'ListHeaderComponent'
> &
  ProviderModelSearchFieldProps & {
    showSearch: boolean;
  };
