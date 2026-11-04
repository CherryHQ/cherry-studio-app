import type { SshReference } from '@/shared/data/types/ssh';

import { isMentionEscaped, readMentionLabel } from './mentionLabels';

const SSH_MENTION_PATTERN =
  /\[((?:\\.|[^\]\\\n])+)\]\(ssh:\/\/connection\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export function createSshMentionUrl(profile: SshReference): string {
  return `ssh://connection/${profile.id}/${profile.revision}`;
}

export function createSshMention(label: string, profile: SshReference): string {
  return `[${label.replace(/[\\[\]]/g, '\\$&')}](${createSshMentionUrl(profile)})`;
}

/** Parse before other mentions so their recorded offsets already refer to the final SSH labels. */
export function readSshMentions(draft: string): { references: SshReference[]; text: string } {
  const references: SshReference[] = [];
  const text = draft.replace(SSH_MENTION_PATTERN, (source, label, id, revision, offset) => {
    if (isMentionEscaped(draft, offset)) return source;
    references.push({ id: id.toLowerCase(), revision: revision.toLowerCase() });
    return readMentionLabel(label);
  });
  return { references, text };
}

export function removeSshMentions(draft: string): string {
  return draft.replace(SSH_MENTION_PATTERN, (source, _label, _id, _revision, offset) =>
    isMentionEscaped(draft, offset) ? source : '',
  );
}
