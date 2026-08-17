import type { ModelSearchFieldProps } from '@/frontend/components/modelPicker';

import type { ProviderModelListContentProps } from '../ProviderModelListContent';

export type ProviderModelListLayoutProps = Omit<
  ProviderModelListContentProps,
  'ListHeaderComponent'
> &
  ModelSearchFieldProps & {
    showSearch: boolean;
  };
