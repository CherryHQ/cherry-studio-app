import { fitDreamingInputs } from '../memoryDreamingModel';
import { prepareDreamingPlan } from '../memoryDreamingPlan';
import { extractContextCandidates, type MemoryExtractionRange } from '../memoryExtraction';
import type { MemoryModel } from '../memoryModel';
import { memoryFixture } from './_memoryFixture';

const source: MemoryExtractionRange = {
  hash: 'source-version',
  messages: [
    {
      id: 'question',
      role: 'user',
      text: 'I prefer Chinese for personal conversations.',
      createdAt: 100,
      version: 'user-version',
    },
    {
      id: 'reply',
      role: 'assistant',
      text: 'You live in Berlin.',
      createdAt: 101,
      version: 'assistant-version',
    },
  ],
};
const candidate = {
  text: 'Prefers Chinese for personal conversations.',
  subject: 'user',
  scope: 'personal',
  kind: 'preference',
  conditions: 'Personal conversations',
  time: '',
  usefulness: 'Use the preferred language',
  action: 'add',
  reason: 'Explicit preference',
  evidence: [{ messageId: 'question', quote: 'I prefer Chinese for personal conversations.' }],
  existing: [],
};
function model(output: unknown): MemoryModel {
  return {
    id: 'default',
    contextWindow: 32768,
    maxInputTokens: 28000,
    maxOutputTokens: 8192,
    countTokens: (text) => Math.ceil(text.length / 4),
    generate: jest.fn(async () => ({ text: JSON.stringify(output), finishReason: 'stop' })),
  };
}
const run = (
  proposal: unknown,
  selected = model({ outcome: 'candidates', reason: 'Useful preference', candidates: [proposal] }),
) =>
  extractContextCandidates(
    source,
    [],
    new AbortController().signal,
    () => {},
    selected,
    () => 1000,
  );

test('binds factual evidence to confirmed user versions and keeps local facts out of shared memory', async () => {
  const personal = await run(candidate);
  expect(personal.candidates[0].evidence[0].version).toBe('user-version');
  const project = await run({ ...candidate, scope: 'project' });
  expect(project.candidates[0].action).toBe('out_of_scope');
});

test.each([
  { ...candidate, evidence: [{ messageId: 'reply', quote: 'You live in Berlin.' }] },
  { ...candidate, evidence: [{ messageId: 'question', quote: 'Fabricated text' }] },
  { ...candidate, action: 'exists', existing: [] },
])(
  'rejects assistant guesses, fabricated quotes and unsupported existing-memory claims',
  async (proposal) => {
    await expect(run(proposal)).rejects.toMatchObject({ reason: 'output' });
  },
);

test('rejects model budget overflow before inference instead of silently truncating evidence', async () => {
  const selected = model({});
  selected.countTokens = () => 1_000_000;
  await expect(run(candidate, selected)).rejects.toMatchObject({ reason: 'budget' });
  expect(selected.generate).not.toHaveBeenCalled();
  expect(() =>
    fitDreamingInputs(
      [{ path: 'MEMORY.md', content: 'Complete entry', hash: 'entry', receipt: 'read' }],
      selected,
    ),
  ).toThrow();
});

test('requires verbatim topic transfer and updated links, then publishes the destination before removing the source', async () => {
  const f = memoryFixture();
  const session = f.open();
  f.set('shared/MEMORY.md', '[Old topic](.memories/old.md)');
  f.set('shared/.memories/old.md', 'Exact original text, including exceptions.\n');
  const paths = await session.list();
  const reads = await Promise.all(paths.map((path) => session.read(path)));
  const proposal = {
    writes: [
      { path: '.memories/combined.md', content: 'Exact original text, including exceptions.\n' },
      { path: 'MEMORY.md', content: '[Combined](.memories/combined.md)' },
    ],
    deletes: [{ path: '.memories/old.md', transferTo: '.memories/combined.md' }],
  };
  await expect(
    prepareDreamingPlan(
      JSON.stringify({ ...proposal, writes: proposal.writes.slice(0, 1) }),
      reads,
      paths,
      session,
    ),
  ).rejects.toThrow('link');
  const plan = await prepareDreamingPlan(JSON.stringify(proposal), reads, paths, session);
  const result = await session.commit(
    plan.mutations,
    undefined,
    [...plan.reads.values()].map((file) => file.receipt),
  );
  expect(result.error).toBeUndefined();
  expect(result.files.map((file) => file.path)).toEqual([
    '.memories/combined.md',
    'MEMORY.md',
    '.memories/old.md',
  ]);
  expect(f.text('shared/.memories/old.md')).toBeNull();
  expect(f.text('shared/.memories/combined.md')).toBe(
    'Exact original text, including exceptions.\n',
  );
});
