import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { AgentSessionInput } from '@/shared/contracts/agent';

import { getChatInputPresentation, shouldShowChatInputQueue } from '../chatInputPresentation';

const attachment: ComposerAttachmentDraft = {
  id: 'attachment-1',
  kind: 'image',
  mediaType: 'image/png',
  name: 'image.png',
  status: 'importing',
  uri: 'file:///image.png',
};

describe('chat input presentation', () => {
  test.each(['', '   \n '])('keeps only the primary stop action after sending: %j', (draft) => {
    expect(getChatInputPresentation({ attachments: [], draft, isBusy: true })).toEqual({
      sendAction: 'auto',
      shouldShowSubmissionOptions: false,
    });
  });

  test('shows delivery options only when composing during an active reply', () => {
    const input = { attachments: [], draft: 'Next message' };
    expect(getChatInputPresentation({ ...input, isBusy: false })).toEqual({
      sendAction: 'send',
      shouldShowSubmissionOptions: false,
    });
    expect(getChatInputPresentation({ ...input, isBusy: true })).toEqual({
      sendAction: 'send',
      shouldShowSubmissionOptions: true,
    });
  });

  test('shows follow-up controls for an attachment-only draft', () => {
    expect(
      getChatInputPresentation({ attachments: [attachment], draft: '', isBusy: true }),
    ).toEqual({ sendAction: 'send', shouldShowSubmissionOptions: true });
  });

  test('shows an ended steering target only while its draft has content', () => {
    const input = { attachments: [], isBusy: false, steeringTarget: 'ended-turn' };
    expect(getChatInputPresentation({ ...input, draft: '' })).toEqual({
      sendAction: 'auto',
      shouldShowSubmissionOptions: false,
    });
    expect(getChatInputPresentation({ ...input, draft: 'Revised direction' })).toEqual({
      sendAction: 'send',
      shouldShowSubmissionOptions: true,
    });
  });

  test.each([false, true])('does not expose an empty queue when paused=%s', (isPaused) => {
    expect(shouldShowChatInputQueue({ isPaused, inputs: [] })).toBe(false);
  });

  test.each([false, true])('shows actual queued inputs when paused=%s', (isPaused) => {
    const input: AgentSessionInput = {
      id: 'input-1',
      sessionId: 'session-1',
      mode: 'follow-up',
      status: 'queued',
      parts: [{ type: 'text', text: 'Next message' }],
      position: 0,
      reason: null,
      turnId: null,
      userMessageId: null,
      assistantMessageId: null,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };
    expect(shouldShowChatInputQueue({ isPaused, inputs: [input] })).toBe(true);
  });
});
