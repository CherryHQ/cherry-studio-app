import { getComposerTextMaxHeight } from '../composer-dock-layout';

const budget = {
  maxDockHeight: 300,
  bottomInset: 34,
  reservedContentHeight: 72,
  minTextHeight: 32,
};

describe('composer text height budget', () => {
  test('reserves the dock safe area, surface padding, toolbar, and footer before text grows', () => {
    expect(getComposerTextMaxHeight(budget)).toBe(166);
    expect(getComposerTextMaxHeight({ ...budget, bottomInset: 0 })).toBe(192);
  });

  test('gives space back to text when attachments leave without changing the dock budget', () => {
    const withAttachments = getComposerTextMaxHeight({
      ...budget,
      reservedContentHeight: budget.reservedContentHeight + 96,
    });

    expect(withAttachments).toBe(70);
    expect(getComposerTextMaxHeight(budget) - withAttachments).toBe(96);
  });

  test('adapts to smaller and larger viewport budgets instead of capping text at 132 points', () => {
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 220 })).toBe(86);
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 500 })).toBe(366);
  });

  test('keeps one text row when non-text content exhausts the available space', () => {
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 80 })).toBe(32);
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 0 })).toBe(32);
  });

  test('honors a larger minimum text row', () => {
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 80, minTextHeight: 64 })).toBe(64);
  });

  test('rounds down so fractional measurements cannot exceed the height budget', () => {
    expect(getComposerTextMaxHeight({ ...budget, maxDockHeight: 300.75 })).toBe(166);
  });
});
