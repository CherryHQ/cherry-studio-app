import { BUILT_IN_TOOL_CAPABILITY_IDS } from '../builtInTool';
import { getBuiltInToolTitleKey } from '../builtInToolTitles';

describe('built-in tool titles', () => {
  test('names every catalog capability', () => {
    for (const id of BUILT_IN_TOOL_CAPABILITY_IDS) {
      expect(getBuiltInToolTitleKey(id)).toEqual(expect.any(String));
    }
  });

  test('ignores names outside the table, including inherited object keys', () => {
    expect(getBuiltInToolTitleKey('calculator')).toBeUndefined();
    expect(getBuiltInToolTitleKey('constructor')).toBeUndefined();
  });
});
