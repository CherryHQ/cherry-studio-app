export type ToolApprovalRespondInput = {
  approvalId: string;
  approved: boolean;
  messageId: string;
  reason?: string;
  updatedInput?: Record<string, unknown>;
};
