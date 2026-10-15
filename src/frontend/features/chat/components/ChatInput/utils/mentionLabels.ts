// The leading object character belongs to the editor's native inline image.
export function createMentionLabel(label: string): string {
  return `￼ ${label}`;
}

/** Whether the mention starting at `offset` follows an odd number of backslashes. */
export function isMentionEscaped(draft: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && draft[index] === '\\'; index--) slashes++;
  return slashes % 2 === 1;
}

/** The plain label inside a mention's brackets, without the inline image or escapes. */
export function readMentionLabel(rawLabel: string): string {
  return rawLabel.replace(/^￼ ?/, '').replace(/\\([\\[\]])/g, '$1');
}
