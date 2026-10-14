import { strToU8, zipSync } from 'fflate';

import { cherryinSkillUrl, parseCherryinSkillUrl } from '@/shared/utils/cherryinSkills';

import { createCherryinSkillClient } from '../cherryinSkillClient';
import { createCherryinSkillSource } from '../cherryinSkillSource';
import { createSkillMarketplace } from '../skillMarketplace';
import type { createGithubSkillSource } from '../skillSources';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: (request: unknown) => mockRequest(request) }),
}));

const listing = {
  id: 'notes-collection',
  name: { en: 'Notes', zh: '笔记' },
  description: { en: 'Take notes', zh: '记录笔记' },
  longDescription: { en: 'More notes', zh: null },
  author: 'CherryIN',
  version: '1',
  domain: 'Productivity',
  tags: ['collection'],
  mobileSupport: 'supported',
  downloads: 1,
  hasPackage: true,
  packageSize: null,
  sourceUrl: null,
};
const page = (items: unknown[], offset = 0, hasMore = false) => ({
  data: { items, pagination: { offset, limit: 20, hasMore } },
});
const entry = (name: string) =>
  strToU8(`---\nname: ${name}\ndescription: Take notes\n---\nWrite notes.`);

beforeEach(() => {
  mockRequest.mockReset();
});

it('requests upstream-supported mobile Skills for the default catalog', async () => {
  mockRequest.mockResolvedValueOnce(page([listing]));
  expect((await createCherryinSkillClient().list({})).items).toHaveLength(1);
  expect(mockRequest.mock.calls[0]![0]).toMatchObject({
    credentials: 'omit',
    query: { mobileSupport: 'supported', limit: 20 },
  });
});

it('preserves mobile filtering with search, categories, sorting and pagination', async () => {
  mockRequest.mockResolvedValueOnce(page([listing], 0, true));
  mockRequest.mockResolvedValueOnce(page([listing], 20));
  const client = createCherryinSkillClient();
  const query = { query: ' notes ', domain: 'Productivity', sort: 'newest' as const };
  const first = await client.list(query);
  expect(first.nextOffset).toBe(20);
  const result = await client.list({ ...query, offset: first.nextOffset! });
  expect(result.nextOffset).toBeNull();
  expect(mockRequest.mock.calls[1]![0]).toMatchObject({
    query: {
      q: 'notes',
      domain: 'Productivity',
      sort: 'newest',
      mobileSupport: 'supported',
      offset: 20,
      limit: 20,
    },
  });
});

it('requires the documented mobile-support classification in catalog responses', async () => {
  mockRequest.mockResolvedValueOnce(page([{ ...listing, mobileSupport: 'unknown' }]));
  await expect(createCherryinSkillClient().list({})).rejects.toMatchObject({
    code: 'search-unavailable',
  });
});

it('keeps details addressable when upstream no longer marks an installed Skill as mobile-supported', async () => {
  mockRequest.mockResolvedValueOnce({ data: { ...listing, mobileSupport: 'unsupported' } });
  await expect(createCherryinSkillClient().detail(listing.id)).resolves.toMatchObject({
    mobileSupport: 'unsupported',
  });
  expect(mockRequest.mock.calls[0]![0]).toMatchObject({ path: `/api/skills/${listing.id}` });
  expect(mockRequest.mock.calls[0]![0].query).toBeUndefined();
});

it('prefers CherryIN for Agent discovery and only falls back when the catalog has no match', async () => {
  const client = createCherryinSkillClient();
  const marketplace = createSkillMarketplace({} as ReturnType<typeof createGithubSkillSource>, {
    client,
    source: createCherryinSkillSource(client),
  });
  mockRequest.mockResolvedValueOnce(page([listing]));
  expect((await marketplace.search('notes'))[0]?.url).toBe(cherryinSkillUrl(listing.id));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  mockRequest.mockResolvedValueOnce(page([]));
  mockRequest.mockResolvedValueOnce({
    data: { skills: [{ source: 'o/r', skillId: 'notes', name: 'notes' }] },
  });
  expect((await marketplace.search('notes'))[0]?.url).toBe('https://skills.sh/o/r/notes');
});

it('pins collection bytes and distinct member identities during resolution', async () => {
  const archive = zipSync({
    'wrapper/a/SKILL.md': entry('alpha'),
    'wrapper/a/references/a.md': strToU8('Reference'),
    'wrapper/b/SKILL.md': entry('beta'),
  });
  mockRequest.mockResolvedValueOnce({ data: listing });
  mockRequest.mockResolvedValueOnce({ data: archive.buffer });
  const source = createCherryinSkillSource(createCherryinSkillClient());
  const candidates = await source.resolveUrl(cherryinSkillUrl(listing.id));
  expect(candidates.map((item) => parseCherryinSkillUrl(item.source.url!)?.entryPath)).toEqual([
    'a/SKILL.md',
    'b/SKILL.md',
  ]);
  mockRequest.mockRejectedValue(new Error('Upstream changed or went offline'));
  const acquired = await source.acquire(candidates[0]!);
  expect([...acquired.files.keys()]).toEqual(['SKILL.md', 'references/a.md']);
  expect(acquired.files.get('SKILL.md')).toEqual(entry('alpha'));
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

it.each([
  'https://skills.cherryin.ai.evil.test/?detail=notes',
  'https://skills.cherryin.ai/?detail=notes#..%2FSKILL.md',
  'https://skills.cherryin.ai/?detail=notes#NOT-SKILL.md',
])('rejects an unsupported or unsafe member URL: %s', (url) => {
  expect(parseCherryinSkillUrl(url)).toBeNull();
});
