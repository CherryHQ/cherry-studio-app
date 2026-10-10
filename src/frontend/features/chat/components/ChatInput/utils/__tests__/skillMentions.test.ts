import {
  createFindSkillsMention,
  createSkillMentionLabel,
  createSkillMentionUrl,
  readSkillMentions,
  removeSkillMentions,
} from '../skillMentions';

const SKILL_ID = '019a0000-0000-7000-8000-000000000001';

describe('composer Skill references', () => {
  test('a Skill reference keeps its identity and label without sending the inline icon marker', () => {
    expect(
      readSkillMentions(
        `[${createSkillMentionLabel('grill-me')}](${createSkillMentionUrl(SKILL_ID)}) 帮我完善方案`,
      ),
    ).toEqual({
      skills: [{ id: SKILL_ID, name: 'grill-me' }],
      text: 'grill-me 帮我完善方案',
    });
  });

  test('the built-in inline reference supplies installation intent without sending artwork characters', () => {
    expect(readSkillMentions(`${createFindSkillsMention('找技能')} 搜索笔记技能`)).toEqual({
      skills: [],
      skillAction: 'find-and-install',
      text: '找技能 搜索笔记技能',
    });
    expect(readSkillMentions('搜索笔记技能')).toEqual({ skills: [], text: '搜索笔记技能' });
  });

  test('installed references retain display text and select UUID identities only once', () => {
    const url = createSkillMentionUrl(SKILL_ID);
    const draft = `[${createSkillMentionLabel('笔记')}](${url}) [Notes](${url.toUpperCase()})`;
    expect(readSkillMentions(draft)).toEqual({
      skills: [{ id: SKILL_ID, name: '笔记' }],
      text: '笔记 Notes',
    });
    expect(readSkillMentions('笔记')).toEqual({ skills: [], text: '笔记' });
  });

  test('escaped brackets and backslashes in labels survive submission', () => {
    expect(readSkillMentions(createFindSkillsMention('Find [notes] \\ tasks'))).toEqual({
      skills: [],
      skillAction: 'find-and-install',
      text: 'Find [notes] \\ tasks',
    });
  });

  test('plain names, unknown links, malformed identities and escaped syntax do not select Skills', () => {
    const text = `@找技能 [docs](https://example.com) [unknown](skill://builtin/other) [bad](skill://installed/invalid) \\[Notes](${createSkillMentionUrl(SKILL_ID)})`;
    expect(readSkillMentions(text)).toEqual({ skills: [], text });
  });

  test('changing Agents removes Skill references while preserving text and plugin references', () => {
    const plugin = '[飞书](tool://plugin/00000000-0000-4000-8000-000000000001/feishu)';
    const draft = `${createFindSkillsMention('找技能')} [笔记](${createSkillMentionUrl(SKILL_ID)}) 用 ${plugin} 整理`;
    const remaining = removeSkillMentions(draft);
    expect(remaining).toBe(`  用 ${plugin} 整理`);
    expect(readSkillMentions(remaining).skills).toEqual([]);
    expect(readSkillMentions(remaining).skillAction).toBeUndefined();
    const escaped = `\\[Notes](${createSkillMentionUrl(SKILL_ID)})`;
    expect(removeSkillMentions(escaped)).toBe(escaped);
  });
});
