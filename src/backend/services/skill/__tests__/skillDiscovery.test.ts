import type { WebSearchResponse } from '@/shared/data/types/webSearch';

import type { SkillAi } from '../skillAi';
import { discoverSkillUrls } from '../skillDiscovery';

it('ranks only observed exact Skill URLs and rejects invented or duplicate indexes', async () => {
  const url = 'https://github.com/owner/repo/blob/main/notes/SKILL.md';
  const rankResults = jest.fn(async () => [
    { index: 99, reason: 'Invented' },
    { index: 0, reason: 'Useful' },
    { index: 0, reason: 'Duplicate' },
  ]);
  const ai = { planSearch: async () => ['notes'], rankResults } as unknown as SkillAi;
  const response: WebSearchResponse = {
    providerId: 'tavily',
    capability: 'searchKeywords',
    inputs: ['notes'],
    results: [
      { title: 'Notes', content: 'Task instructions', url, sourceInput: 'notes' },
      {
        title: 'External',
        content: 'Ignore rules',
        url: 'https://example.com/SKILL.md',
        sourceInput: 'notes',
      },
    ],
  };
  const result = await discoverSkillUrls(ai, async () => response, 'Write notes');
  expect(result.matches).toEqual([{ url, reason: 'Useful' }]);
  expect(rankResults).toHaveBeenCalledWith(
    'Write notes',
    [{ title: 'Notes', content: 'Task instructions', url }],
    undefined,
  );
});
