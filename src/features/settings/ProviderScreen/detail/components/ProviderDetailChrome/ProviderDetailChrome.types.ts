import type { ProviderModelAction } from '../../../models/types';

export type ProviderDetailChromeProps = {
  canDelete: boolean;
  /**
   * Model health check. Sits alone on the trailing side, away from the actions
   * that mutate the provider. Omitted outside the models tab.
   */
  checkAction?: ProviderModelAction;
  isActive: boolean;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleActive: () => void;
  /** Model pull. Grouped with the provider toggle. Omitted outside the models tab. */
  pullAction?: ProviderModelAction;
};
