export type ProviderModelPullChromeProps = {
  /** Whether "select all" would undo a full selection rather than make one. */
  isAllSelected: boolean;
  isApplying: boolean;
  onApply: () => void;
  onToggleAll: () => void;
  selectedCount: number;
};
