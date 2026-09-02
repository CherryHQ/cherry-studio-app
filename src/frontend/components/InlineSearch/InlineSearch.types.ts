export type InlineSearchProps = {
  /**
   * Called with the current query on every edit, including clears.
   *
   * The caller owns the query. Android binds `value` straight back into the
   * field, while iOS hands the text to UIKit and only reports it back, so a
   * caller that resets `value` on iOS must unmount this component to make the
   * native field agree.
   */
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
};
