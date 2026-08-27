export type ProviderModelPullChromeProps = {
  /** Whether "select all" would undo a full selection rather than make one. */
  isAllSelected: boolean;
  isApplying: boolean;
  /** Whether select-all is scoped to an active search or purpose filter. */
  isSelectionScoped: boolean;
  isToggleAllDisabled: boolean;
  onApply: () => void;
  onToggleAll: () => void;
  selectedCount: number;
};
