import type { HttpClient } from '@/backend/services/http';

import { createGithubSkillSource } from '../skillSources';

jest.mock('@/backend/services/http', () => ({
  createHttpClient: jest.fn(),
  isHttpError: () => false,
}));

const SHA = 'a'.repeat(40);
const URL = 'https://github.com/owner/repo/blob/main/skills/notes/SKILL.md';

function serving(entry: string) {
  const client = {
    request: async ({ path }: { path: string }) => ({
      data: path.includes('/commits/') ? { sha: SHA } : new TextEncoder().encode(entry).buffer,
    }),
  } as unknown as HttpClient;
  return createGithubSkillSource({ api: client, raw: client });
}

describe('GitHub Skill source', () => {
  it('reads candidate metadata from the YAML frontmatter', async () => {
    const source = serving('---\nname: "notes"\ndescription: >-\n  Take\n  notes\n---\nname: body');
    await expect(source.resolveUrl(URL)).resolves.toMatchObject({
      name: 'notes',
      description: 'Take notes',
      source: { registry: 'github', locator: 'github:owner/repo/skills/notes', revision: SHA },
    });
  });

  it('still lists a package whose frontmatter is invalid, named after its directory', async () => {
    const source = serving('---\nname: [other\n---\nBody');
    await expect(source.resolveUrl(URL)).resolves.toMatchObject({
      name: 'notes',
      description: 'Skill from owner/repo',
    });
  });
});
