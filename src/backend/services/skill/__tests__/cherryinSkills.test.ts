import { strToU8, zipSync } from 'fflate';

import type { NetworkRegion } from '@/backend/services/region';
import {
  CHERRYIN_SKILLS_CN_URL,
  CHERRYIN_SKILLS_GLOBAL_URL,
  cherryinSkillUrl,
  parseCherryinSkillUrl,
} from '@/shared/utils/cherryinSkills';

import { createCherryinSkillClient } from '../cherryinSkillClient';
import { createCherryinSkillSource } from '../cherryinSkillSource';
import { createSkillMarketplace } from '../skillMarketplace';
import type { createGithubSkillSource } from '../skillSources';

const mockRequest = jest.fn();
jest.mock('@/backend/services/http', () => ({
  createHttpClient: ({ baseUrl }: { baseUrl: string }) => ({
    request: (request: unknown) => mockRequest(baseUrl, request),
  }),
}));

const listing = {
  id: 'notes-collection',
  name: { en: 'Notes', zh: '笔记' },
  description: { en: 'Take notes', zh: '记录笔记' },
  longDescription: { en: 'More notes', zh: null },
  author: 'CherryIN',
  version: '1',
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
const mockGetRegion = jest.fn<Promise<NetworkRegion | null>, []>(async () => 'GLOBAL');

beforeEach(() => {
  mockRequest.mockReset();
  mockGetRegion.mockReset().mockResolvedValue('GLOBAL');
});

it('requests the full catalog without filtering mobile support', async () => {
  mockRequest.mockResolvedValueOnce(
    page([listing, { ...listing, id: 'desktop-notes', mobileSupport: 'unsupported' }]),
  );
  const { items } = await createCherryinSkillClient(mockGetRegion).list({});
  expect(items.map((item) => item.mobileSupport)).toEqual(['supported', 'unsupported']);
  expect(mockRequest.mock.calls[0]![1]).toMatchObject({
    credentials: 'omit',
    query: { limit: 20 },
  });
  expect(mockRequest.mock.calls[0]![1].query).not.toHaveProperty('mobileSupport');
});

it('preserves search, popularity order and pagination without mobile filtering', async () => {
  mockRequest.mockResolvedValueOnce(page([listing], 0, true));
  mockRequest.mockResolvedValueOnce(page([listing], 20));
  const client = createCherryinSkillClient(mockGetRegion);
  const query = { query: ' notes ' };
  const first = await client.list(query);
  expect(first.nextOffset).toBe(20);
  const result = await client.list({ ...query, offset: first.nextOffset! });
  expect(result.nextOffset).toBeNull();
  expect(mockRequest.mock.calls[1]![1].query).toEqual({
    q: 'notes',
    sort: 'popular',
    offset: 20,
    limit: 20,
  });
});

it('requires the documented mobile-support classification in catalog responses', async () => {
  mockRequest.mockResolvedValueOnce(page([{ ...listing, mobileSupport: 'unknown' }]));
  await expect(createCherryinSkillClient(mockGetRegion).list({})).rejects.toMatchObject({
    code: 'search-unavailable',
  });
});

it('keeps details addressable when upstream no longer marks an installed Skill as mobile-supported', async () => {
  mockRequest.mockResolvedValueOnce({ data: { ...listing, mobileSupport: 'unsupported' } });
  await expect(createCherryinSkillClient(mockGetRegion).detail(listing.id)).resolves.toMatchObject({
    mobileSupport: 'unsupported',
    pageUrl: cherryinSkillUrl(listing.id, undefined, CHERRYIN_SKILLS_GLOBAL_URL),
  });
  expect(mockRequest.mock.calls[0]![1]).toMatchObject({ path: `/api/skills/${listing.id}` });
  expect(mockRequest.mock.calls[0]![1].query).toBeUndefined();
});

it.each([
  ['CN', CHERRYIN_SKILLS_CN_URL],
  [null, CHERRYIN_SKILLS_CN_URL],
  ['GLOBAL', CHERRYIN_SKILLS_GLOBAL_URL],
] as const)(
  'routes CherryIN list, search, detail, and download for region %s to %s',
  async (region, expectedOrigin) => {
    mockGetRegion.mockResolvedValue(region);
    const client = createCherryinSkillClient(mockGetRegion);
    const marketplace = createSkillMarketplace({} as ReturnType<typeof createGithubSkillSource>, {
      client,
      source: createCherryinSkillSource(client),
    });
    const archive = zipSync({ 'SKILL.md': entry('alpha') });
    mockRequest
      .mockResolvedValueOnce(page([listing]))
      .mockResolvedValueOnce({ data: listing })
      .mockResolvedValueOnce({ data: archive.buffer });

    const searchResults = await marketplace.search('notes');
    expect(searchResults[0]?.url).toBe(cherryinSkillUrl(listing.id, undefined, expectedOrigin));
    expect(mockRequest.mock.calls[0]![0]).toBe(expectedOrigin);

    const candidates = await createCherryinSkillSource(client).resolveUrl(searchResults[0]!.url);
    expect(mockRequest.mock.calls[1]![0]).toBe(expectedOrigin);
    expect(mockRequest.mock.calls[2]![0]).toBe(expectedOrigin);
    expect(candidates[0]?.source.url).toBe(
      cherryinSkillUrl(listing.id, 'SKILL.md', expectedOrigin),
    );
    expect(mockGetRegion).toHaveBeenCalledTimes(2);
  },
);

it('prefers CherryIN for Agent discovery and only falls back when the catalog has no match', async () => {
  const client = createCherryinSkillClient(mockGetRegion);
  const marketplace = createSkillMarketplace({} as ReturnType<typeof createGithubSkillSource>, {
    client,
    source: createCherryinSkillSource(client),
  });
  mockRequest.mockResolvedValueOnce(page([listing]));
  expect((await marketplace.search('notes'))[0]?.url).toBe(
    cherryinSkillUrl(listing.id, undefined, CHERRYIN_SKILLS_GLOBAL_URL),
  );
  expect(mockRequest).toHaveBeenCalledTimes(1);
  for (const items of [[], [{ ...listing, hasPackage: false }]]) {
    mockRequest.mockResolvedValueOnce(page(items));
    mockRequest.mockResolvedValueOnce({
      data: { skills: [{ source: 'o/r', skillId: 'notes', name: 'notes' }] },
    });
    expect((await marketplace.search('notes'))[0]?.url).toBe('https://skills.sh/o/r/notes');
  }
});

it('pins collection bytes and distinct member identities during resolution', async () => {
  const archive = zipSync({
    'wrapper/a/SKILL.md': entry('alpha'),
    'wrapper/a/references/a.md': strToU8('Reference'),
    'wrapper/b/SKILL.md': entry('beta'),
  });
  mockRequest.mockResolvedValueOnce({ data: listing });
  mockRequest.mockResolvedValueOnce({ data: archive.buffer });
  const source = createCherryinSkillSource(createCherryinSkillClient(mockGetRegion));
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
  ['https://skills.cherryin.ai/?detail=notes', { id: 'notes', entryPath: undefined }],
  [
    'https://skills.cherryin.com.cn/?detail=notes#a%2FSKILL.md',
    { id: 'notes', entryPath: 'a/SKILL.md' },
  ],
])('accepts regional CherryIN URL %s', (url, expected) => {
  expect(parseCherryinSkillUrl(url)).toEqual(expected);
});

it.each([
  'https://skills.cherryin.ai.evil.test/?detail=notes',
  'https://skills.cherryin.com.cn.evil.test/?detail=notes',
  'https://skills.cherryin.ai/?detail=notes#..%2FSKILL.md',
  'https://skills.cherryin.ai/?detail=notes#NOT-SKILL.md',
])('rejects an unsupported or unsafe member URL: %s', (url) => {
  expect(parseCherryinSkillUrl(url)).toBeNull();
});
