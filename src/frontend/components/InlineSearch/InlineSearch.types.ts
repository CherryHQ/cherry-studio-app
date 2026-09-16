export type InlineSearchLayout = 'embedded' | 'screen';

export type InlineSearchProps = {
  layout?: InlineSearchLayout;
  /**
   * Called with the current query on every edit, including clears.
   *
   * The caller owns the query, including across window-size changes. Content
   * fields bind `value` directly; native iOS search uses its command ref.
   */
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
};
