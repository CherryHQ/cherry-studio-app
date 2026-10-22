import { createMentionLabel } from '../mentionLabels';
import { createPluginMentionUrl, readPluginMentions } from '../pluginMentions';
import { createSelectionMention, readSelectionMentions } from '../selectionMentions';
import { readSkillMentions } from '../skillMentions';

const FILE_ID = '00000000-0000-7000-8000-000000000001';
const SERVER_ID = '00000000-0000-4000-8000-000000000002';
const selection = {
  file_entry_id: FILE_ID,
  anchor: { format: 'docx' as const, paragraph: 30 },
  excerpt: '3．区域分化明显：华东、华南收入合计 1,739.2 万元 (50.4%) [ok] `code` 😀',
};

describe('composer selection references', () => {
  test('a chip round-trips its selection and leaves only the label in the prompt', () => {
    const draft = `${createSelectionMention('报告.docx · ¶31', selection)} 改得更正式`;
    expect(draft).not.toContain('区域分化');
    expect(readSelectionMentions(draft)).toMatchObject({
      selectionReferences: [{ type: 'selection', selection, label: '报告.docx · ¶31', offset: 0 }],
      text: '报告.docx · ¶31 改得更正式',
    });
  });

  test('shifts plugin offsets that follow a removed chip', () => {
    const draft = `${createSelectionMention('a.xlsx · 假设!B4', { ...selection, anchor: { format: 'xlsx', sheet: '假设', range: 'B4' } })} 用 [${createMentionLabel('飞书')}](${createPluginMentionUrl(SERVER_ID, 'feishu')}) 发出去`;
    const plugins = readPluginMentions(draft);
    const skills = readSkillMentions(plugins.text, plugins.pluginReferences);
    const selections = readSelectionMentions(skills.text);
    const [plugin] = skills.pluginReferences;
    const offset = selections.shift(plugin.offset);
    expect(selections.text.slice(offset, offset + plugin.label.length)).toBe('飞书');
    expect(selections.selectionReferences[0].label).toBe('a.xlsx · 假设!B4');
  });

  test('ignores tampered or escaped chips', () => {
    expect(readSelectionMentions('[x](selection://bm90LWpzb24)').selectionReferences).toEqual([]);
    const escaped = `\\${createSelectionMention('a', selection)}`;
    expect(readSelectionMentions(escaped).selectionReferences).toEqual([]);
  });
});
