import type { ProviderModelAction } from '../../../models/types';

export type ProviderDetailChromeProps = {
  canDelete: boolean;
  /** Enters model selection. Omitted outside the models tab, or with nothing to select. */
  editAction?: { isDisabled: boolean; onPress: () => void };
  isActive: boolean;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleActive: () => void;
  /** Model pull. Grouped with the provider toggle. Omitted outside the models tab. */
  pullAction?: ProviderModelAction;
  /**
   * Given while selecting models, and it takes the bar over: the provider's own
   * actions have nothing to do with a selection, and leaving them there invites
   * deleting the provider mid-selection.
   */
  selection?: { isAllSelected: boolean; onToggleAll: () => void };
};
