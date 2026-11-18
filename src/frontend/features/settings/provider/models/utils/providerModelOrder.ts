import type { ModelOrderMove } from '@/shared/data/api/schemas/models';
import type { UniqueModelId } from '@/shared/data/types/model';

export type ProviderModelOrderGroup = 'chat' | 'painting';

/** Plan each subsequence independently; provider-wide boundaries are never group boundaries. */
export function planProviderModelReorder({
  draftIds,
  groupOf,
  originalIds,
}: {
  draftIds: readonly string[];
  groupOf: (id: string) => ProviderModelOrderGroup;
  originalIds: readonly string[];
}): ModelOrderMove[] {
  const moves: ModelOrderMove[] = [];
  for (const group of ['chat', 'painting'] as const) {
    const original = originalIds.filter((id) => groupOf(id) === group);
    const draft = draftIds.filter((id) => groupOf(id) === group);
    const originalIndex = new Map(original.map((id, index) => [id, index]));
    // Fixed points must remain untouched, even when a different LIS would be equally long.
    const fixed = draft.flatMap((id, index) => (original[index] === id ? [index] : []));
    const retained = new Set(fixed.map((index) => draft[index]!));
    const boundaries = [-1, ...fixed, draft.length];
    for (let part = 1; part < boundaries.length; part += 1) {
      const start = boundaries[part - 1]!;
      const end = boundaries[part]!;
      const candidates = draft.slice(start + 1, end).filter((id) => {
        const index = originalIndex.get(id)!;
        return index > start && index < end;
      });
      for (const id of increasingSubsequence(candidates, originalIndex)) retained.add(id);
    }
    for (let index = 0; index < draft.length; index += 1) {
      const id = draft[index]!;
      if (retained.has(id)) continue;
      const previous = draft[index - 1];
      // A preceding target has already landed. A following retained row is never a target.
      const nextRetained = previous ? undefined : draft.find((next) => retained.has(next));
      moves.push({
        id: id as UniqueModelId,
        anchor: previous
          ? { after: previous as UniqueModelId }
          : { before: nextRetained as UniqueModelId },
      });
    }
  }
  return moves;
}

/** O(n log n) longest increasing subsequence of original positions. */
function increasingSubsequence(ids: string[], positions: ReadonlyMap<string, number>): string[] {
  const tails: number[] = [];
  const previous: number[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    let low = 0;
    let high = tails.length;
    const position = positions.get(ids[index]!)!;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (positions.get(ids[tails[middle]!]!)! < position) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? tails[low - 1]! : -1;
    tails[low] = index;
  }
  const result: string[] = [];
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!) {
    result.push(ids[index]!);
  }
  return result.toReversed();
}
