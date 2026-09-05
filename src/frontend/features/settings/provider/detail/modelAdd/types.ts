import type { Provider } from '@/shared/data/types/provider';

export type ProviderModelTaskProps = {
  provider: Provider;
  returnTo?: string;
  shouldEnableProvider: boolean;
};
