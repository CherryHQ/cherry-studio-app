import { splitPluginReferences } from '../pluginReferences';

const reference = { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 5 };

describe('message plugin references', () => {
  test('preserves arbitrary prose and only decorates the recorded occurrence', () => {
    expect(splitPluginReferences('📄 用 飞书，**飞书**', [reference])).toEqual([
      { text: '📄 用 ' },
      { text: '飞书', reference },
      { text: '，**飞书**' },
    ]);
  });

  test('ignores foreign, overlapping, out-of-range, and stale metadata', () => {
    expect(
      splitPluginReferences('📄 用 飞书', [
        { type: 'citation' },
        { ...reference, offset: 99 },
        { ...reference, label: 'Feishu' },
        reference,
        reference,
      ]),
    ).toEqual([{ text: '📄 用 ' }, { text: '飞书', reference }]);
    expect(splitPluginReferences('飞书')).toEqual([{ text: '飞书' }]);
  });
});
