import type { ProviderMetadata } from 'ai';

import type { CherryMessagePart } from '../message';
import { readCherryMeta, readCherryToolMetadata, withCherryMeta } from '../uiParts';

function reasoningPart(
  providerMetadata?: ProviderMetadata,
): Extract<CherryMessagePart, { type: 'reasoning' }> {
  return {
    type: 'reasoning',
    text: 'thinking...',
    state: 'done',
    ...(providerMetadata && { providerMetadata }),
  };
}

function filePart(
  providerMetadata?: ProviderMetadata,
): Extract<CherryMessagePart, { type: 'file' }> {
  return {
    type: 'file',
    filename: 'notes.pdf',
    mediaType: 'application/pdf',
    url: 'file:///notes.pdf',
    ...(providerMetadata && { providerMetadata }),
  };
}

function toolPart(toolMetadata?: unknown): Extract<CherryMessagePart, { type: 'dynamic-tool' }> {
  return {
    input: {},
    state: 'input-available',
    toolCallId: 'call-1',
    toolName: 'search',
    type: 'dynamic-tool',
    ...(toolMetadata !== undefined && { toolMetadata }),
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}

describe('readCherryMeta', () => {
  test('returns undefined when providerMetadata.cherry is missing', () => {
    expect(readCherryMeta(reasoningPart())).toBeUndefined();
  });

  test('parses a valid reasoning cherry meta payload', () => {
    const part = reasoningPart({ cherry: { thinkingMs: 1200, startedAt: 42 } });

    expect(readCherryMeta(part)).toEqual({ thinkingMs: 1200, startedAt: 42 });
  });

  test('returns undefined for a malformed payload instead of throwing', () => {
    const part = reasoningPart({ cherry: { thinkingMs: 'not-a-number' } });

    expect(readCherryMeta(part)).toBeUndefined();
  });

  test('parses the complete desktop-compatible file metadata shape', () => {
    const part = filePart({
      cherry: {
        composerFileKind: 'pasted-text',
        fileEntryId: 'file-entry-1',
        fileTokenSourceId: 'composer-source-1',
      },
    });

    expect(readCherryMeta(part)).toEqual({
      composerFileKind: 'pasted-text',
      fileEntryId: 'file-entry-1',
      fileTokenSourceId: 'composer-source-1',
    });
  });

  test('rejects malformed file metadata without throwing', () => {
    const part = filePart({ cherry: { composerFileKind: 'upload' } });

    expect(readCherryMeta(part)).toBeUndefined();
  });
});

describe('withCherryMeta', () => {
  test('writes a patch onto a part with no existing metadata', () => {
    const part = reasoningPart();

    const patched = withCherryMeta(part, { thinkingMs: 500 });

    expect(readCherryMeta(patched)).toEqual({ thinkingMs: 500 });
  });

  test('merges a patch with existing cherry fields instead of replacing them', () => {
    const part = reasoningPart({ cherry: { startedAt: 42 } });

    const patched = withCherryMeta(part, { thinkingMs: 500 });

    expect(readCherryMeta(patched)).toEqual({ startedAt: 42, thinkingMs: 500 });
  });

  test('merges file identity without replacing composer metadata', () => {
    const part = filePart({ cherry: { fileTokenSourceId: 'composer-source-1' } });

    const patched = withCherryMeta(part, { fileEntryId: 'file-entry-1' });

    expect(readCherryMeta(patched)).toEqual({
      fileEntryId: 'file-entry-1',
      fileTokenSourceId: 'composer-source-1',
    });
  });
});

describe('readCherryToolMetadata', () => {
  test('parses MCP identity copied from a tool definition', () => {
    const part = toolPart({
      cherry: {
        tool: {
          serverId: 'server-1',
          serverName: 'Docs',
          type: 'mcp',
        },
      },
    });

    expect(readCherryToolMetadata(part)).toEqual({
      tool: {
        serverId: 'server-1',
        serverName: 'Docs',
        type: 'mcp',
      },
    });
  });

  test('returns undefined for malformed tool metadata', () => {
    // Malform fields the schema still declares. `z.object` strips unknown keys
    // rather than rejecting them, so a bad value on a field that was since
    // removed would parse clean and invert this assertion in silence.
    expect(
      readCherryToolMetadata(toolPart({ cherry: { tool: { serverName: 42, type: 'mcp' } } })),
    ).toBeUndefined();
    // `type` is an enum, so an unknown value can't be stripped away either.
    expect(
      readCherryToolMetadata(toolPart({ cherry: { tool: { type: 'unknown' } } })),
    ).toBeUndefined();
  });
});
