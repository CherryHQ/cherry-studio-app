export type InlineSearchLayout = 'embedded' | 'screen';

export type InlineSearchProps = {
  layout?: InlineSearchLayout;
  /**
   * Called with the current query on every edit, including clears.
   *
   * The caller owns the query. Android binds `value` directly to the field;
   * iOS synchronizes it through the native search bar command ref.
   */
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
};
