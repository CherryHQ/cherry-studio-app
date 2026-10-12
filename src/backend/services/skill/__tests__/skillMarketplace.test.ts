import { createSkillMarketplace } from '../skillMarketplace';
import type { createGithubSkillSource } from '../skillSources';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

const marketplace = createSkillMarketplace({} as ReturnType<typeof createGithubSkillSource>);

beforeEach(() => {
  mockRequest.mockReset();
});

describe('skills.sh listings', () => {
  it('lists the most installed GitHub-hosted Skills in registry order', async () => {
    mockRequest.mockResolvedValueOnce({
      data: {
        skills: [
          {
            source: 'vercel-labs/skills',
            skillId: 'find-skills',
            name: 'find-skills',
            installs: 9,
          },
          { source: 'open.feishu.cn', skillId: 'lark-wiki', name: 'lark-wiki', installs: 8 },
          { source: 'o/r', skillId: 'nested/skill', name: 'nested', installs: 7 },
          { source: 'o/r', skillId: 'notes', name: 'notes', installs: 'many' },
        ],
      },
    });

    await expect(marketplace.popular()).resolves.toEqual([
      {
        name: 'find-skills',
        source: 'vercel-labs/skills',
        url: 'https://skills.sh/vercel-labs/skills/find-skills',
        installs: 9,
      },
      { name: 'notes', source: 'o/r', url: 'https://skills.sh/o/r/notes' },
    ]);
    expect(mockRequest.mock.calls[0]![0]).toMatchObject({
      method: 'GET',
      path: '/api/skills/all-time/0',
    });
  });

  it('bounds the popular list to one screen of rows', async () => {
    mockRequest.mockResolvedValueOnce({
      data: {
        skills: Array.from({ length: 200 }, (_, index) => ({
          source: 'o/r',
          skillId: `skill-${index}`,
          name: `skill-${index}`,
          installs: 200 - index,
        })),
      },
    });

    const listings = await marketplace.popular();

    expect(listings).toHaveLength(50);
    expect(listings[0]!.name).toBe('skill-0');
  });

  it('searches by keywords with the same listing rules', async () => {
    mockRequest.mockResolvedValueOnce({
      data: {
        skills: [
          { id: 'o/r/notes', source: 'o/r', skillId: 'notes', name: 'notes', installs: 3 },
          {
            id: 'open.feishu.cn/lark-wiki',
            source: 'open.feishu.cn',
            skillId: 'lark-wiki',
            name: 'lark-wiki',
          },
        ],
      },
    });

    await expect(marketplace.search('notes')).resolves.toEqual([
      { name: 'notes', source: 'o/r', url: 'https://skills.sh/o/r/notes', installs: 3 },
    ]);
    expect(mockRequest.mock.calls[0]![0]).toMatchObject({
      path: '/api/search',
      query: { q: 'notes', limit: '20' },
    });
  });

  it('reports an unreachable or malformed registry as unavailable', async () => {
    mockRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(marketplace.popular()).rejects.toMatchObject({ code: 'search-unavailable' });

    mockRequest.mockResolvedValueOnce({ data: { items: [] } });
    await expect(marketplace.popular()).rejects.toMatchObject({ code: 'search-unavailable' });
  });
});
