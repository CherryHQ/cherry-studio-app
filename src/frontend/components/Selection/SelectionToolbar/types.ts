export type SelectionToolbarAction = {
  id: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export type SelectionToolbarProps = {
  actions?: readonly SelectionToolbarAction[];
  allSelected: boolean;
  isPending: boolean;
  onDelete: () => void;
  onToggleAll: () => void;
  selectedCount: number;
  selectableCount: number;
};
