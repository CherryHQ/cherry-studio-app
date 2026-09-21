/**
 * Calendar day used to throttle the activity ping to one report per day.
 *
 * Deliberately the device's local day rather than UTC: the ping stands in for
 * "this install was used today", and a user's day is the one on their clock.
 */
export function localDateKey(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
