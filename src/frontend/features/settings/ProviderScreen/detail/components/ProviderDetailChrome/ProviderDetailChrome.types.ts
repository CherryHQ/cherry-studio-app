import type { ProviderModelAction } from '../../../models/types';

export type ProviderDetailChromeProps = {
  canDelete: boolean;
  isActive: boolean;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleActive: () => void;
  /** Model pull. Grouped with the provider toggle. Omitted outside the models tab. */
  pullAction?: ProviderModelAction;
};
