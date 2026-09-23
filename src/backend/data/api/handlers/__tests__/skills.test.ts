import type {
  AgentGlobalSkillService,
  ListSkillsResult,
} from '@/backend/data/services/AgentGlobalSkillService';
import type { Skill, SkillAdmission } from '@/shared/data/types/skill';

import { createSkillHandlers } from '../skills';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';

it('fills composer pages from eligible results beyond a blocked SQL page and keeps a usable cursor', async () => {
  const row = (name: string) => ({ skill: { id: name, name } as Skill, binding: null });
  const list = jest
    .fn(async (): Promise<ListSkillsResult> => ({ items: [] }))
    .mockResolvedValueOnce({ items: [row('blocked')], nextCursor: 'sql-next' })
    .mockResolvedValueOnce({ items: [row('ready-a'), row('ready-b')] });
  const service = { list } as unknown as AgentGlobalSkillService;
  const handlers = createSkillHandlers(service, {
    evaluate: async (skills) =>
      skills.map((skill) => {
        const admission: SkillAdmission = {
          status: skill.name === 'blocked' ? 'setup-required' : 'ready',
          reasons: [],
        };
        return { admission, agentAdmission: admission };
      }),
  });
  const result = await handlers['/skills'].GET({
    query: { scope: 'composer', agentId: AGENT_ID, limit: 1 },
  });
  expect(result.items.map((skill) => skill.name)).toEqual(['ready-a']);
  expect(result.nextCursor).toBe(JSON.stringify(['ready-a', 'ready-a']));
  expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'sql-next' }));
});
