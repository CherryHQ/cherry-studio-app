import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import {
  messageExamples,
  STORY_EDITED_FILE_ENTRY_ID,
  STORY_FILE_ENTRY_ID,
  STORY_WRITTEN_FILE_ENTRY_ID,
} from '../messageFixtures';

describe('messages Storybook fixtures', () => {
  it('covers every message adapter family in the playground', () => {
    const messages = messageExamples.map((example) => example.message);
    const parts = messages.flatMap((message) => message.data.parts ?? []);
    const partTypes = new Set(parts.map((part) => part.type));
    const toolNames = new Set(
      parts.flatMap((part) => {
        if (part.type === 'dynamic-tool') return [part.toolName];
        if (part.type.startsWith('tool-')) return [part.type.slice('tool-'.length)];
        return [];
      }),
    );

    expect(new Set(messages.map((message) => message.role))).toEqual(
      new Set(['assistant', 'user']),
    );
    expect(messages.some((message) => message.status === 'pending')).toBe(true);
    expect([...partTypes]).toEqual(
      expect.arrayContaining([
        'data-code',
        'data-compact',
        'data-error',
        'data-future',
        'data-translation',
        'dynamic-tool',
        'file',
        'reasoning',
        'source-url',
        'text',
      ]),
    );
    expect([...toolNames]).toEqual(
      expect.arrayContaining([
        'calculator',
        'edit_file',
        'read_file',
        'tool_exec',
        'tool_inspect',
        'tool_invoke',
        'tool_search',
        'web_search',
        'write_file',
      ]),
    );
    expect(
      parts.some(
        (part) => part.type === 'file' && readCherryMeta(part)?.fileEntryId === STORY_FILE_ENTRY_ID,
      ),
    ).toBe(true);
    expect(
      parts.some(
        (part) =>
          part.type === 'file' && readCherryMeta(part)?.fileEntryId === STORY_EDITED_FILE_ENTRY_ID,
      ),
    ).toBe(true);
    // A written file renders as its own card, so its id must be one the story providers resolve.
    expect(
      parts.some(
        (part) =>
          part.type === 'file' && readCherryMeta(part)?.fileEntryId === STORY_WRITTEN_FILE_ENTRY_ID,
      ),
    ).toBe(true);
  });
});
