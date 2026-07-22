export type SelectionToolbarProps = {
  isDeleting: boolean;
  onDelete: () => void;
  onToggleAll: () => void;
  selectedCount: number;
};
