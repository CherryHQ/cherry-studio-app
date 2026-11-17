import type { ModelOrderMove } from '@/shared/data/api/schemas/models';

import { planProviderModelReorder, type ProviderModelOrderGroup } from '../providerModelOrder';

const groupOf = (id: string): ProviderModelOrderGroup =>
  id.startsWith('p::P') ? 'painting' : 'chat';
const ids = (values: string[]) => values.map((id) => `p::${id}`);
function apply(original: string[], moves: ModelOrderMove[]) {
  const result = [...original];
  for (const { id, anchor } of moves) {
    result.splice(result.indexOf(id), 1);
    if ('before' in anchor) result.splice(result.indexOf(anchor.before), 0, id);
    else if ('after' in anchor) result.splice(result.indexOf(anchor.after) + 1, 0, id);
    else throw new Error('Provider-wide boundary emitted');
  }
  return result;
}
function check(original: string[], draft: string[]) {
  const moves = planProviderModelReorder({ originalIds: original, draftIds: draft, groupOf });
  const targets = new Set<string>(moves.map(({ id }) => id));
  expect(targets.size).toBe(moves.length);
  const landed = new Set<string>();
  for (const { id, anchor } of moves) {
    expect('position' in anchor).toBe(false);
    const relative = 'before' in anchor ? anchor.before : 'after' in anchor ? anchor.after : '';
    expect(relative).not.toBe(id);
    expect(groupOf(relative)).toBe(groupOf(id));
    expect(!targets.has(relative) || landed.has(relative)).toBe(true);
    const originalGroup = original.filter((other) => groupOf(other) === groupOf(id));
    const draftGroup = draft.filter((other) => groupOf(other) === groupOf(id));
    expect(originalGroup.indexOf(id)).not.toBe(draftGroup.indexOf(id));
    landed.add(id);
  }
  const result = apply(original, moves);
  for (const group of ['chat', 'painting']) {
    expect(result.filter((id) => groupOf(id) === group)).toEqual(
      draft.filter((id) => groupOf(id) === group),
    );
  }
  return moves;
}

describe('planProviderModelReorder', () => {
  it('leaves unchanged and empty drafts untouched', () => {
    expect(check([], [])).toEqual([]);
    expect(check(ids(['A', 'P1', 'B']), ids(['A', 'P1', 'B']))).toEqual([]);
  });
  it.each([
    [
      ['A', 'B', 'C', 'D'],
      ['D', 'A', 'B', 'C'],
    ],
    [
      ['A', 'B', 'C', 'D'],
      ['B', 'C', 'D', 'A'],
    ],
    [
      ['A', 'B', 'C', 'D'],
      ['A', 'D', 'B', 'C'],
    ],
    [
      ['A', 'B', 'C', 'D'],
      ['A', 'C', 'B', 'D'],
    ],
  ])('uses one move for a single head, tail or middle edit: %j → %j', (original, draft) => {
    expect(check(ids(original), ids(draft))).toHaveLength(1);
  });
  it('applies two moves sequentially within a group', () => {
    expect(check(ids(['A', 'B', 'C', 'D']), ids(['C', 'D', 'A', 'B']))).toHaveLength(2);
  });
  it('moves both interleaved groups with same-group anchors', () => {
    expect(
      check(ids(['P1', 'A', 'P2', 'B', 'C', 'P3']), ids(['P3', 'C', 'P1', 'A', 'B', 'P2'])),
    ).toHaveLength(2);
  });
  it('never targets the unchanged middle of a reversed group', () => {
    const moves = check(ids(['A', 'B', 'C']), ids(['C', 'B', 'A']));
    expect(moves.map(({ id }) => id)).not.toContain('p::B');
  });
  it('keeps a raw id ending in /order intact', () => {
    const moves = check(ids(['A', 'org/model/order', 'B']), ids(['org/model/order', 'A', 'B']));
    expect(moves).toHaveLength(1);
  });
  it('ignores interleaving-only edits', () => {
    expect(check(ids(['A', 'P1', 'B', 'P2']), ids(['P1', 'P2', 'A', 'B']))).toEqual([]);
  });
  it('converges for every permutation, including fixed points and later targets', () => {
    function permutations(values: string[]): string[][] {
      if (!values.length) return [[]];
      return values.flatMap((id, index) =>
        permutations(values.filter((_, at) => at !== index)).map((rest) => [id, ...rest]),
      );
    }
    const original = ids(['A', 'B', 'C', 'D', 'E', 'F']);
    for (const draft of permutations(original)) check(original, draft);
  });
});
