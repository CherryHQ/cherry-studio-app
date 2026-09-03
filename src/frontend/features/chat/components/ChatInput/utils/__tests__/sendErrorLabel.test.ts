import { type AgentErrorView, AgentProtocolError } from '@/shared/contracts/agent';

import { getSendErrorLabelKey } from '../sendErrorLabel';

function protocolError(code: AgentErrorView['code'], message = 'diagnostic text') {
  return new AgentProtocolError({ code, message, retryable: false });
}

describe('getSendErrorLabelKey', () => {
  test.each<[AgentErrorView['code'], string]>([
    ['AGENT_NOT_FOUND', 'chat.input.sendError.agentNotFound'],
    ['SESSION_NOT_FOUND', 'chat.input.sendError.sessionNotFound'],
    ['SESSION_BUSY', 'chat.input.sendError.sessionBusy'],
    ['CAPABILITY_UNSUPPORTED', 'chat.input.sendError.unsupported'],
    ['EXECUTION_UNAVAILABLE', 'chat.input.sendError.executionUnavailable'],
    ['ATTACHMENT_INVALID', 'chat.input.attachmentsRejected'],
    ['ATTACHMENT_UNAVAILABLE', 'chat.input.attachmentUnavailable'],
    ['ATTACHMENT_METADATA_MISMATCH', 'chat.input.attachmentUnavailable'],
  ])('maps %s to a translation key', (code, key) => {
    expect(getSendErrorLabelKey(protocolError(code))).toBe(key);
  });

  test('never surfaces the diagnostic protocol message', () => {
    const error = protocolError('ATTACHMENT_INVALID', 'Attachment "x" has unsupported media type.');

    expect(getSendErrorLabelKey(error)).not.toContain('unsupported media type');
  });

  test('leaves codes without composer copy to the generic send failure', () => {
    expect(getSendErrorLabelKey(protocolError('APPROVAL_NOT_FOUND'))).toBeUndefined();
    expect(getSendErrorLabelKey(protocolError('MESSAGE_NOT_FOUND'))).toBeUndefined();
  });

  test('ignores errors that are not protocol errors', () => {
    expect(getSendErrorLabelKey(new Error('network down'))).toBeUndefined();
    expect(getSendErrorLabelKey('string')).toBeUndefined();
  });
});
