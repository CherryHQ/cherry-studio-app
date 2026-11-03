/** Only an appended, single newline on a nonempty draft counts as Return. */
export function isReturnSubmission(previous: string, next: string, enabled: boolean): boolean {
  return enabled && previous.trim().length > 0 && next === `${previous}\n`;
}
