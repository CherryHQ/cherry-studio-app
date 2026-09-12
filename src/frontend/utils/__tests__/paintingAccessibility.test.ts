import type { TFunction } from 'i18next';

import { paintingOutputAccessibilityLabel } from '../paintingAccessibility';

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction;

describe('paintingOutputAccessibilityLabel', () => {
  it('normalizes and bounds the prompt summary', () => {
    expect(
      paintingOutputAccessibilityLabel(t, {
        count: 2,
        index: 1,
        prompt: `  ${'a'.repeat(81)}\nnext line  `,
      }),
    ).toBe(
      `painting.outputAccessibility:${JSON.stringify({
        count: 2,
        index: 1,
        prompt: `${'a'.repeat(79)}…`,
      })}`,
    );
  });

  it('omits the prompt clause when a model generated without one', () => {
    expect(paintingOutputAccessibilityLabel(t, { count: 1, index: 1, prompt: '  \n ' })).toBe(
      'painting.outputAccessibilityWithoutPrompt:{"count":1,"index":1}',
    );
  });
});
