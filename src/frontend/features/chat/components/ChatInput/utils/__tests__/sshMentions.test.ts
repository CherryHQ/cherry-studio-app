import { createSshMention, readSshMentions, removeSshMentions } from '../sshMentions';

const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: '22222222-2222-4222-8222-222222222222',
};

test('keeps the exact connection revision and readable escaped label when sending a mention', () => {
  const mention = createSshMention('SSH · host [backup] \\ one', profile);
  const draft = `Check ${mention} now`;
  const { shift, ...parsed } = readSshMentions(draft);
  expect(parsed).toEqual({
    references: [profile],
    sshReferences: [{ type: 'ssh', label: 'SSH · host [backup] \\ one', offset: 6 }],
    text: 'Check SSH · host [backup] \\ one now',
  });
  expect(shift(0)).toBe(0);
  expect(shift(draft.indexOf(' now'))).toBe(parsed.text.indexOf(' now'));
  expect(removeSshMentions(`Check ${mention} now`)).toBe('Check  now');
});

test('escaped or malformed links never select a connection or consume ordinary draft text', () => {
  const mention = createSshMention('host', profile);
  const text = `\\${mention} [literal](ssh://connection/not-an-id/not-a-revision)`;
  const { shift, ...parsed } = readSshMentions(text);
  expect(parsed).toEqual({ references: [], sshReferences: [], text });
  expect(shift(text.length)).toBe(text.length);
  expect(removeSshMentions(text)).toBe(text);
});

test('reports all connection references so stale pasted mentions can be refused', () => {
  const next = { ...profile, revision: '33333333-3333-4333-8333-333333333333' };
  expect(
    readSshMentions(`${createSshMention('old', profile)} ${createSshMention('new', next)}`)
      .references,
  ).toEqual([profile, next]);
});
