import {
  ASSISTANT_MESSAGE_ACTION_IDS,
  ASSISTANT_TOOLBAR_MAX_PINNED,
  DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG as defaults,
  isLockedOverflowAction,
  normalizeAssistantMessageToolbarConfig as normalize,
  pinAssistantToolbarAction as pin,
  reorderAssistantToolbarZone as reorder,
  unpinAssistantToolbarAction as unpin,
} from '../assistantMessageToolbar';

describe('assistant toolbar configuration', () => {
  test('preserves defaults and stable normalized snapshots', () => {
    expect(defaults).toEqual({
      pinned: ['copy', 'readAloud', 'retry', 'answerWith', 'fork'],
      overflow: ['edit', 'translate', 'share', 'delete'],
    });
    expect(normalize(defaults)).toBe(defaults);
    expect(ASSISTANT_TOOLBAR_MAX_PINNED).toBe(5);
    expect(ASSISTANT_MESSAGE_ACTION_IDS.filter(isLockedOverflowAction)).toEqual(['delete']);
  });

  test.each([undefined, null, false, 0, 'copy', ['copy']])(
    'restores defaults for non-object or legacy input %p',
    (raw) => expect(normalize(raw)).toEqual(defaults),
  );

  test.each([{}, { pinned: null, overflow: 'copy' }, { pinned: 1, overflow: {} }])(
    'repairs missing or malformed zones without pinning missing IDs: %p',
    (raw) => {
      expect(normalize(raw)).toEqual({ pinned: [], overflow: [...ASSISTANT_MESSAGE_ACTION_IDS] });
    },
  );

  test('drops unknown/non-string IDs and deduplicates with pinned precedence', () => {
    expect(
      normalize({
        pinned: ['share', null, 'share', 'unknown', 'copy', 1, {}, ['edit']],
        overflow: ['edit', 'share', 'edit', 'copy', false, 'delete', 'delete'],
      }),
    ).toEqual({
      pinned: ['share', 'copy'],
      overflow: ['edit', 'readAloud', 'retry', 'answerWith', 'fork', 'translate', 'delete'],
    });
  });

  test('moves excess pins to the beginning of overflow in order without mutating input', () => {
    const raw = { pinned: [...ASSISTANT_MESSAGE_ACTION_IDS], overflow: ['edit', 'copy'] };
    const original = structuredClone(raw);
    expect(normalize(raw)).toEqual(defaults);
    expect(raw).toEqual(original);
  });

  test('moves delete out of pinned and always puts it last in overflow', () => {
    expect(normalize({ pinned: ['delete', 'copy'], overflow: ['delete', 'share'] })).toEqual({
      pinned: ['copy'],
      overflow: [
        'share',
        'readAloud',
        'retry',
        'answerWith',
        'fork',
        'edit',
        'translate',
        'delete',
      ],
    });
  });

  test('inserts newly known IDs before locked actions while preserving user order', () => {
    expect(normalize({ pinned: ['share'], overflow: ['translate', 'delete', 'copy'] })).toEqual({
      pinned: ['share'],
      overflow: ['translate', 'copy', 'readAloud', 'retry', 'answerWith', 'fork', 'edit', 'delete'],
    });
  });

  test('allows zero pinned actions and normalizes idempotently', () => {
    const empty = normalize({ pinned: [], overflow: [] });
    expect(empty.pinned).toEqual([]);
    expect(empty.overflow).toEqual(ASSISTANT_MESSAGE_ACTION_IDS);
    expect(normalize(empty)).toBe(empty);
  });

  test('unpins to the front and pins to the end, retaining all other order', () => {
    const next = unpin(defaults, 'readAloud');
    expect(next).toEqual({
      pinned: ['copy', 'retry', 'answerWith', 'fork'],
      overflow: ['readAloud', 'edit', 'translate', 'share', 'delete'],
    });
    expect(pin(next, 'translate')).toEqual({
      pinned: ['copy', 'retry', 'answerWith', 'fork', 'translate'],
      overflow: ['readAloud', 'edit', 'share', 'delete'],
    });
    expect(defaults.pinned).toEqual(['copy', 'readAloud', 'retry', 'answerWith', 'fork']);
  });

  test('ignores full pins, already pinned actions, unpinned actions, and locked actions', () => {
    const fewer = unpin(defaults, 'fork');
    expect(pin(defaults, 'share')).toBe(defaults);
    expect(pin(fewer, 'copy')).toBe(fewer);
    expect(pin(fewer, 'delete')).toBe(fewer);
    expect(unpin(defaults, 'delete')).toBe(defaults);
    expect(unpin(defaults, 'share')).toBe(defaults);
  });

  test('normalizes before applying operations', () => {
    const broken = { pinned: ['delete', 'copy'], overflow: ['share', 'share'] } as typeof defaults;
    expect(pin(broken, 'share').pinned).toEqual(['copy', 'share']);
    expect(unpin(broken, 'copy').overflow.slice(0, 2)).toEqual(['copy', 'share']);
    expect(reorder(broken, 'overflow', 1, 0).overflow.slice(0, 2)).toEqual(['readAloud', 'share']);
  });

  test('reorders only within the selected zone', () => {
    expect(reorder(defaults, 'pinned', 4, 0)).toEqual({
      pinned: ['fork', 'copy', 'readAloud', 'retry', 'answerWith'],
      overflow: defaults.overflow,
    });
    expect(reorder(defaults, 'overflow', 2, 0)).toEqual({
      pinned: defaults.pinned,
      overflow: ['share', 'edit', 'translate', 'delete'],
    });
    expect(reorder(defaults, 'pinned', 0, 4).pinned).toEqual([
      'readAloud',
      'retry',
      'answerWith',
      'fork',
      'copy',
    ]);
  });

  test.each([
    [-1, 0],
    [0, -1],
    [99, 0],
    [0, 99],
    [0, 0],
    [0.5, 0],
    [0, 0.5],
    [NaN, 0],
    [0, Infinity],
  ])('ignores invalid/no-op reorder %p -> %p', (from, to) => {
    expect(reorder(defaults, 'pinned', from, to)).toBe(defaults);
    expect(reorder(defaults, 'overflow', from, to)).toBe(defaults);
  });

  test('cannot move delete or move an item past delete', () => {
    expect(reorder(defaults, 'overflow', 3, 0)).toBe(defaults);
    expect(reorder(defaults, 'overflow', 0, 3)).toBe(defaults);
    const empty = normalize({ pinned: [], overflow: [] });
    expect(reorder(empty, 'pinned', 0, 1)).toBe(empty);
  });
});
