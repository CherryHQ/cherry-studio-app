import type { SshReference, SshTextReference } from '@/shared/data/types/ssh';

import { isMentionEscaped, readMentionLabel } from './mentionLabels';

const SSH_MENTION_PATTERN =
  /\[((?:\\.|[^\]\\\n])+)\]\(ssh:\/\/connection\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function createSshMentionUrl(profile: SshReference): string {
  return `ssh://connection/${profile.id}/${profile.revision}`;
}

export function createSshMention(label: string, profile: SshReference): string {
  return `[${label.replace(/[\\[\]]/g, '\\$&')}](${createSshMentionUrl(profile)})`;
}

/** Keep display spans separate from the transient connection identities checked on send. */
export function readSshMentions(draft: string): {
  references: SshReference[];
  sshReferences: SshTextReference[];
  shift: (offset: number) => number;
  text: string;
} {
  const references: SshReference[] = [];
  const sshReferences: SshTextReference[] = [];
  const removed: { end: number; length: number }[] = [];
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(SSH_MENTION_PATTERN)) {
    const [source, rawLabel, id, revision] = match;
    if (isMentionEscaped(draft, match.index)) continue;
    const label = readMentionLabel(rawLabel);
    if (!label) continue;
    text += draft.slice(cursor, match.index);
    references.push({ id: id.toLowerCase(), revision: revision.toLowerCase() });
    sshReferences.push({ type: 'ssh', label, offset: text.length });
    text += label;
    cursor = match.index + source.length;
    removed.push({ end: cursor, length: source.length - label.length });
  }
  return {
    references,
    sshReferences,
    shift: (offset) =>
      offset - removed.reduce((sum, item) => sum + (item.end <= offset ? item.length : 0), 0),
    text: text + draft.slice(cursor),
  };
}

export function removeSshMentions(draft: string): string {
  return draft.replace(SSH_MENTION_PATTERN, (source, _label, _id, _revision, offset) =>
    isMentionEscaped(draft, offset) ? source : '',
  );
}
