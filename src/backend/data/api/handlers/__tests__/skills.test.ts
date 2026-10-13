import type {
  AgentGlobalSkillService,
  ListSkillsResult,
} from '@/backend/data/services/AgentGlobalSkillService';
import type { Skill } from '@/shared/data/types/skill';

import { createSkillHandlers } from '../skills';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';

it('fills composer pages from readable results beyond a missing-package SQL page and keeps a usable cursor', async () => {
  const row = (name: string) => ({ skill: { id: name, name } as Skill, binding: null });
  const list = jest
    .fn(async (): Promise<ListSkillsResult> => ({ items: [] }))
    .mockResolvedValueOnce({ items: [row('missing')], nextCursor: 'sql-next' })
    .mockResolvedValueOnce({ items: [row('ready-a'), row('ready-b')] });
  const service = { list } as unknown as AgentGlobalSkillService;
  const handlers = createSkillHandlers(
    service,
    {
      read: (skill) => ({
        isPackageMissing: skill.name === 'missing',
        limitations: { scripts: [], unavailableTools: [] },
      }),
    },
    { read: async () => null },
  );
  const result = await handlers['/skills'].GET({
    query: { scope: 'composer', agentId: AGENT_ID, limit: 1 },
  });
  expect(result.items.map((skill) => skill.name)).toEqual(['ready-a']);
  expect(result.nextCursor).toBe(JSON.stringify(['ready-a', 'ready-a']));
  expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'sql-next' }));
});

it('returns the complete installed instruction body and its pinned revision', async () => {
  const skill = {
    id: AGENT_ID,
    name: 'notes',
    contentHash: 'directory-sha256:abcdef',
    isEnabled: false,
  } as Skill;
  const service = { getById: async () => skill } as unknown as AgentGlobalSkillService;
  const availability = {
    read: () => ({ isPackageMissing: false, limitations: { scripts: [], unavailableTools: [] } }),
  };
  const handlers = createSkillHandlers(service, availability, {
    read: async () => 'Write notes.\nRead references/template.md.',
  });
  const result = await handlers['/skills/:skillId/instructions'].GET({
    params: { skillId: skill.id },
  });
  expect(result).toEqual({
    skillId: skill.id,
    name: skill.name,
    contentHash: skill.contentHash,
    instructions: 'Write notes.\nRead references/template.md.',
  });
  const missing = createSkillHandlers(service, availability, { read: async () => null });
  await expect(
    missing['/skills/:skillId/instructions'].GET({ params: { skillId: skill.id } }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
