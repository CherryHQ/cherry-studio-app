import { describe, expect, it } from 'vitest';

import { mergeSelectedModels } from '../merge-selected-models';

describe('mergeSelectedModels', () => {
  it('updates the selected model without refreshing or deleting unrelated models', () => {
    const retained = { id: 'retained', price: 1 };
    const absentUpstream = { id: 'absent-upstream', price: 2 };
    const selected = { id: 'selected', price: 3 };

    expect(
      mergeSelectedModels(
        [retained, absentUpstream, { id: 'selected', price: 0 }],
        [selected, { id: 'retained', price: 100 }, { id: 'new-upstream', price: 4 }],
        ['selected'],
      ),
    ).toEqual([retained, absentUpstream, selected]);
  });

  it('adds an explicitly selected new model once', () => {
    expect(mergeSelectedModels([{ id: 'existing' }], [{ id: 'new' }], ['new', 'new'])).toEqual([
      { id: 'existing' },
      { id: 'new' },
    ]);
  });

  it('rejects unknown selections instead of removing a bundled model', () => {
    expect(() => mergeSelectedModels([{ id: 'missing' }], [], ['missing'])).toThrow(
      'Cannot regenerate unknown model: missing',
    );
  });
});
