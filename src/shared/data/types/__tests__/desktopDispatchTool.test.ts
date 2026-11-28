import {
  DESKTOP_DISPATCH_MAX_ATTACHMENTS,
  DESKTOP_DISPATCH_MAX_TEXT_LENGTH,
  DesktopDispatchApprovalInputSchema,
  DesktopDispatchAttachmentSchema,
  DesktopDispatchLastTargetSchema,
  DesktopDispatchResultSchema,
  DesktopDispatchWorkspaceSchema,
} from '../desktopDispatchTool';

const attachment = {
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  name: 'report.pdf',
  mediaType: 'application/pdf',
};
const target = {
  connectionId: 'desktop-1',
  connectionName: 'Desktop',
  agentId: 'agent-1',
  agentName: 'Research',
  workspace: { kind: 'registered', id: 'workspace-1', name: 'Reports' },
  workspaceName: 'Reports',
};
const task = { ...target, title: 'Summarize report', attachments: [attachment] };
const approval = { ...task, text: 'Summarize the attachment.', textCharLength: 25 };
const result = { ...task, status: 'dispatched', promptPreview: 'Summarize the attachment.' };

describe('desktop dispatch schemas', () => {
  test.each([
    { kind: 'registered', id: 'workspace-1', name: 'Reports' },
    { kind: 'registered', id: 'workspace-1' },
    { kind: 'system' },
  ])('accepts workspace %p', (workspace) => {
    expect(DesktopDispatchWorkspaceSchema.parse(workspace)).toEqual(workspace);
    const lastTarget = { connectionId: target.connectionId, agentId: target.agentId, workspace };
    const savedWorkspace =
      workspace.kind === 'registered'
        ? { kind: 'registered', id: workspace.id }
        : { kind: 'system' };
    expect(DesktopDispatchLastTargetSchema.parse(lastTarget)).toEqual({
      ...lastTarget,
      workspace: savedWorkspace,
    });
  });

  test.each([
    { kind: 'registered' },
    { kind: 'registered', id: '' },
    { kind: 'unknown', id: 'workspace-1' },
  ])('rejects invalid workspace %p', (workspace) => {
    expect(DesktopDispatchWorkspaceSchema.safeParse(workspace).success).toBe(false);
    expect(DesktopDispatchLastTargetSchema.safeParse({ ...target, workspace }).success).toBe(false);
  });

  test('validates managed attachment IDs and non-empty metadata', () => {
    expect(DesktopDispatchAttachmentSchema.parse(attachment)).toEqual(attachment);
    expect(
      DesktopDispatchAttachmentSchema.safeParse({ ...attachment, fileEntryId: 'report.pdf' })
        .success,
    ).toBe(false);
    expect(DesktopDispatchAttachmentSchema.safeParse({ ...attachment, name: '' }).success).toBe(
      false,
    );
    expect(
      DesktopDispatchAttachmentSchema.safeParse({ ...attachment, mediaType: '' }).success,
    ).toBe(false);
  });

  test('accepts approval input, including an empty prompt', () => {
    expect(DesktopDispatchApprovalInputSchema.parse(approval)).toEqual(approval);
    const emptyPrompt = { ...approval, text: '', textCharLength: 0 };
    expect(DesktopDispatchApprovalInputSchema.parse(emptyPrompt)).toEqual(emptyPrompt);
  });

  test.each([{ connectionId: '' }, { title: '' }, { textCharLength: -1 }, { textCharLength: 1.5 }])(
    'rejects invalid approval fields %p',
    (fields) => {
      expect(DesktopDispatchApprovalInputSchema.safeParse({ ...approval, ...fields }).success).toBe(
        false,
      );
    },
  );

  test.each(['dispatched', 'pending_confirmation', 'desktop_offline', 'rejected'])(
    'accepts result status %s',
    (status) => {
      const payload = { ...result, status };
      expect(DesktopDispatchResultSchema.parse(payload)).toEqual(payload);
    },
  );

  test('rejects unknown result statuses and empty session IDs', () => {
    expect(DesktopDispatchResultSchema.safeParse({ ...result, status: 'unknown' }).success).toBe(
      false,
    );
    expect(DesktopDispatchResultSchema.safeParse({ ...result, sessionId: '' }).success).toBe(false);
  });

  test('limits approvals and results to eight attachments', () => {
    expect(DESKTOP_DISPATCH_MAX_ATTACHMENTS).toBe(8);
    const attachments = Array.from({ length: DESKTOP_DISPATCH_MAX_ATTACHMENTS }, () => attachment);
    const tooMany = [...attachments, attachment];
    expect(DesktopDispatchApprovalInputSchema.safeParse({ ...approval, attachments }).success).toBe(
      true,
    );
    expect(DesktopDispatchResultSchema.safeParse({ ...result, attachments }).success).toBe(true);
    expect(
      DesktopDispatchApprovalInputSchema.safeParse({ ...approval, attachments: tooMany }).success,
    ).toBe(false);
    expect(DesktopDispatchResultSchema.safeParse({ ...result, attachments: tooMany }).success).toBe(
      false,
    );
  });

  test('exports a 32,768-character text limit', () => {
    expect(DESKTOP_DISPATCH_MAX_TEXT_LENGTH).toBe(32_768);
  });
});
