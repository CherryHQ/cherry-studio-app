import { splitTextReferences } from '../textReferences';

const SKILL_ID = '00000000-0000-4000-8000-000000000001';
const plugin = { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: 5 };
const selection = {
  type: 'skill',
  skillId: SKILL_ID,
  name: 'grill-me',
  contentHash: 'directory-sha256:9182bf6a50b9',
  origin: 'explicit',
};

describe('message inline references', () => {
  test('preserves arbitrary prose and only decorates the recorded plugin occurrence', () => {
    expect(splitTextReferences('📄 用 飞书，**飞书**', [plugin])).toEqual([
      { text: '📄 用 ' },
      { text: '飞书', reference: plugin },
      { text: '，**飞书**' },
    ]);
  });

  test('ignores foreign, overlapping, out-of-range, and stale metadata', () => {
    expect(
      splitTextReferences('📄 用 飞书', [
        { type: 'citation' },
        { ...plugin, offset: 99 },
        { ...plugin, label: 'Feishu' },
        plugin,
        plugin,
      ]),
    ).toEqual([{ text: '📄 用 ' }, { text: '飞书', reference: plugin }]);
    expect(splitTextReferences('飞书')).toEqual([{ text: '飞书' }]);
  });

  test('merges Skill and plugin ranges without decorating an ordinary repeated name', () => {
    const skill = { type: 'skill', skillId: SKILL_ID, label: 'grill-me', offset: 17 };
    const pluginReference = { ...plugin, offset: 14 };
    const action = {
      type: 'skill-action',
      action: 'find-and-install',
      label: '找技能',
      offset: 26,
    };
    expect(
      splitTextReferences('grill-me 📄 用 飞书 grill-me 找技能', [
        action,
        pluginReference,
        skill,
        selection,
      ]),
    ).toEqual([
      { text: 'grill-me 📄 用 ' },
      { text: '飞书', reference: pluginReference },
      { text: ' ' },
      { text: 'grill-me', reference: skill },
      { text: ' ' },
      { text: '找技能', reference: action },
    ]);
  });

  test('recovers the screenshot message from an older selection receipt', () => {
    expect(splitTextReferences('grill-me ask me some things about launch', [selection])).toEqual([
      {
        text: 'grill-me',
        reference: { type: 'skill', skillId: SKILL_ID, label: 'grill-me', offset: 0 },
      },
      { text: ' ask me some things about launch' },
    ]);
    expect(splitTextReferences('grill-me-extra and grill-me', [selection])).toEqual([
      { text: 'grill-me-extra and ' },
      {
        text: 'grill-me',
        reference: { type: 'skill', skillId: SKILL_ID, label: 'grill-me', offset: 19 },
      },
    ]);
  });
});
