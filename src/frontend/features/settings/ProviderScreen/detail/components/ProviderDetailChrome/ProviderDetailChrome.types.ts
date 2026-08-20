import type { ProviderModelAction } from '../../../models/types';

export type ProviderDetailChromeProps = {
  /** Enters model selection. Omitted outside the models tab, or with nothing to select. */
  editAction?: { isDisabled: boolean; onPress: () => void };
  /** Model pull. Grouped with the provider toggle. Omitted outside the models tab. */
  pullAction?: ProviderModelAction;
  /**
   * Given while selecting models, and it takes the bar over: pulling models has
   * nothing to do with a selection already made.
   */
  selection?: { isAllSelected: boolean; onToggleAll: () => void };
};
