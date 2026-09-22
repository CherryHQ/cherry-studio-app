export function timestampToISO(value: Date | number): string {
  return new Date(value).toISOString();
}
