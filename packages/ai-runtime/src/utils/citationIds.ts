export type RandomUuid = () => string;

/** Create a per-lookup prefix so result IDs stay unique across one assistant message. */
export function newCitePrefix(randomUuid: RandomUuid): string {
  return randomUuid().slice(0, 8);
}

export function citeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}
