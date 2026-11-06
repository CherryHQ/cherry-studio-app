import { AgentProtocolError } from '@/shared/contracts/agent';

import { buildEditUserMessageInput } from '../editSubmission';

const base = {
  sessionId: 'session-1',
  messageId: 'user-1',
  text: 'Edited question',
  attachmentCount: 0,
  mode: 'standard' as const,
  replyModels: null,
  selectedModelId: 'provider/model-a' as never,
  reasoningEfforts: [] as never,
  reasoningSelection: {
    isReasoningEffortSelected: false,
    reasoningEffort: 'medium',
    selectReasoningEffort: () => {},
  } as never,
};

describe('buildEditUserMessageInput', () => {
  it('submits the raw text so the host remaps mention labels onto stored parts', () => {
    const input = buildEditUserMessageInput({
      ...base,
      text: 'compare @file:report.pdf with this',
    });
    expect(input.text).toBe('compare @file:report.pdf with this');
    expect(input).toMatchObject({ sessionId: 'session-1', messageId: 'user-1' });
  });

  it('snapshots the live model, parallel replies and skill mentions', () => {
    const input = buildEditUserMessageInput({
      ...base,
      text: 'do it with [Deep Research](skill://installed/01234567-89ab-cdef-0123-456789abcdef)',
      replyModels: ['provider/model-b', 'provider/model-c'] as never,
      selectedModelId: 'provider/model-a' as never,
    });
    // The first parallel model becomes the primary; the rest are additional.
    expect(input.modelId).toBe('provider/model-b');
    expect(input.additionalModelIds).toEqual(['provider/model-c']);
    // Skill mentions resolve to ids while their labels stay in the text.
    expect(input.skillIds).toEqual(['01234567-89ab-cdef-0123-456789abcdef']);
    expect(input.text).toContain('(skill://installed/01234567-89ab-cdef-0123-456789abcdef)');
  });

  it('falls back to the agent model when no parallel selection exists', () => {
    const input = buildEditUserMessageInput(base);
    expect(input.modelId).toBe('provider/model-a');
    expect(input.additionalModelIds).toBeUndefined();
  });

  it('omits reasoning effort when the model offers none', () => {
    const input = buildEditUserMessageInput(base);
    expect(input.reasoningEffort).toBeUndefined();
  });

  it('rejects loudly when attachments race an in-flight import', () => {
    expect(() => buildEditUserMessageInput({ ...base, attachmentCount: 1 })).toThrow(
      AgentProtocolError,
    );
    expect(() => buildEditUserMessageInput({ ...base, attachmentCount: 1 })).toThrow(
      expect.objectContaining({
        view: expect.objectContaining({ code: 'CAPABILITY_UNSUPPORTED' }),
      }),
    );
  });

  it('rejects loudly without a Session', () => {
    expect(() => buildEditUserMessageInput({ ...base, sessionId: undefined })).toThrow(
      expect.objectContaining({
        view: expect.objectContaining({ code: 'SESSION_NOT_FOUND' }),
      }),
    );
  });
});
