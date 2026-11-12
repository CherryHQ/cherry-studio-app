import type { AgentTemplateCatalog } from '@/shared/data/types/agentTemplate';

import { readAgentTemplateSnapshot, writeAgentTemplateSnapshot } from '../agentTemplateSnapshot';

jest.mock('expo-file-system', () => {
  const state = { files: new Map<string, string>(), failMove: false };
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, '')).join('/');
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    create() {}
  }
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return state.files.has(this.uri);
    }
    get size() {
      return state.files.get(this.uri)?.length ?? 0;
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get parentDirectory() {
      return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/')));
    }
    create() {
      state.files.set(this.uri, '');
    }
    writeSync(body: string) {
      state.files.set(this.uri, body);
    }
    async text() {
      const body = state.files.get(this.uri);
      if (body === undefined) throw new Error('File not found');
      return body;
    }
    async move(destination: MockFile) {
      // Native overwrite can remove the destination before a move fails.
      state.files.delete(destination.uri);
      if (state.failMove) throw new Error('Move interrupted');
      state.files.set(destination.uri, await this.text());
      state.files.delete(this.uri);
    }
  }
  return { File: MockFile, Paths: { document: '/documents' }, testState: state };
});
const { testState } = jest.requireMock<{
  testState: { files: Map<string, string>; failMove: boolean };
}>('expo-file-system');
function catalog(revision: string): AgentTemplateCatalog {
  return {
    language: 'en',
    revision: revision.repeat(40),
    templates: [
      {
        id: 'writer',
        name: 'Writer',
        description: '',
        emoji: '✍️',
        group: ['Writing'],
        prompt: 'Write.\r\n',
        categories: ['writing'],
      },
    ],
  };
}

beforeEach(() => {
  testState.files.clear();
  testState.failMove = false;
});

it('keeps the last active catalog when an inactive-slot overwrite is interrupted', async () => {
  const first = await writeAgentTemplateSnapshot(catalog('a'), null);
  const second = await writeAgentTemplateSnapshot(catalog('b'), first);
  testState.failMove = true;
  await expect(writeAgentTemplateSnapshot(catalog('c'), second)).rejects.toThrow(
    'Move interrupted',
  );
  await expect(readAgentTemplateSnapshot('en')).resolves.toEqual(second);
});

it.each([
  { body: '{', reason: 'truncated JSON' },
  {
    body: JSON.stringify({
      schemaVersion: 2,
      fetchedAt: Number.MAX_SAFE_INTEGER,
      catalog: catalog('b'),
    }),
    reason: 'an incompatible schema',
  },
  {
    body: JSON.stringify({
      schemaVersion: 1,
      fetchedAt: Number.MAX_SAFE_INTEGER,
      catalog: { ...catalog('b'), language: 'zh' },
    }),
    reason: 'a mismatched language',
  },
  {
    body: JSON.stringify({
      schemaVersion: 1,
      fetchedAt: Number.MAX_SAFE_INTEGER,
      catalog: { ...catalog('b'), templates: [] },
    }),
    reason: 'invalid template content',
  },
])('recovers the previous complete slot from $reason', async ({ body }) => {
  const first = await writeAgentTemplateSnapshot(catalog('a'), null);
  testState.files.set('/documents/agent-templates/en-b.json', body);
  await expect(readAgentTemplateSnapshot('en')).resolves.toEqual(first);
});

it('selects the last complete write even if the wall clock moves backwards', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(2000);
  try {
    const first = await writeAgentTemplateSnapshot(catalog('a'), null);
    clock.mockReturnValue(1000);
    const second = await writeAgentTemplateSnapshot(catalog('b'), first);
    await expect(readAgentTemplateSnapshot('en')).resolves.toEqual(second);
  } finally {
    clock.mockRestore();
  }
});
