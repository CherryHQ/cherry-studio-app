/**
 * A model-list action owned by `ProviderDetailScreen` and handed to more than one
 * surface — the bottom toolbar renders it as an icon button, the empty model list
 * as its call to action — so the two cannot drift apart.
 */
export type ProviderModelAction = {
  isDisabled?: boolean;
  isLoading?: boolean;
  onPress: () => void;
};
