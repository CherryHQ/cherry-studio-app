import { AgentEmojiAvatarSchema } from '@/shared/data/types/agent';

import { getAgentTemplate, getAgentTemplates } from '../agentTemplates';

describe('bundled Agent templates', () => {
  it('ships the same 796 unique, creatable template identities in both source languages', () => {
    const english = getAgentTemplates('en-US');
    const chinese = getAgentTemplates('zh-CN');
    expect(english).toHaveLength(796);
    expect(new Set(english.map((template) => template.id)).size).toBe(796);
    expect(chinese.map((template) => template.id)).toEqual(english.map((template) => template.id));
    for (const template of [...english, ...chinese]) {
      expect(template.name.trim()).not.toBe('');
      expect(template.prompt.trim()).not.toBe('');
      expect(AgentEmojiAvatarSchema.safeParse(template.emoji).success).toBe(true);
    }
  });

  it('uses the shared language resolver for Chinese scripts and English fallback content', () => {
    expect(getAgentTemplates('zh-Hant-HK')).toBe(getAgentTemplates('zh-CN'));
    expect(getAgentTemplates('fr-CA')).toBe(getAgentTemplates('en-US'));
    const id = getAgentTemplates('en-US')[0]!.id;
    expect(getAgentTemplate(id, 'en-US')?.name).toBe('Product Manager');
    expect(getAgentTemplate(id, 'zh-CN')?.name).toBe('产品经理');
    expect(getAgentTemplate('missing-template', 'en-US')).toBeUndefined();
  });
});
