import {
  CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
  configureBuiltinProviderInputSchema,
  CREATE_CUSTOM_PROVIDER_TOOL_NAME,
  createCustomProviderInputSchema,
  isProviderConfigurationToolName,
  providerConfigurationSummarySchema,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { CherryMessagePart, Message } from '@cherrystudio/universal/data/types/message';
import { readCherryToolMetadata } from '@cherrystudio/universal/data/types/uiParts';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

function isToolPart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export type PendingToolApproval = {
  approvalId: string;
  input: unknown;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolType?: 'builtin' | 'mcp' | 'provider';
};

export function getPendingToolApprovals(messages: readonly Message[]): PendingToolApproval[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') {
    return [];
  }

  const approvals: PendingToolApproval[] = [];
  for (const part of last.data.parts ?? []) {
    if (isToolPart(part) && part.state === 'approval-requested') {
      const toolType = readCherryToolMetadata(part)?.tool?.type;
      approvals.push({
        approvalId: part.approval.id,
        input: part.input,
        messageId: last.id,
        toolCallId: part.toolCallId,
        toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
        ...(toolType && { toolType }),
      });
    }
  }
  return approvals;
}

export function getApprovedProviderConfigurationIds(
  messages: readonly Message[],
  decision: {
    approvalId: string;
    approved: boolean;
    updatedInput?: Record<string, unknown>;
  },
): string[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return [];

  const providerIds = new Set<string>();
  for (const part of last.data.parts ?? []) {
    if (!isToolPart(part)) continue;
    const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
    if (!isProviderConfigurationToolName(toolName)) continue;

    if (part.state === 'output-available') {
      const summary = providerConfigurationSummarySchema.safeParse(part.output).data;
      if (summary?.providerId) providerIds.add(summary.providerId);
      continue;
    }

    const isPreviouslyApproved = part.state === 'approval-responded' && part.approval.approved;
    const isCurrentApproval =
      part.state === 'approval-requested' &&
      part.approval.id === decision.approvalId &&
      decision.approved;
    if (!isPreviouslyApproved && !isCurrentApproval) continue;

    const input = isCurrentApproval && decision.updatedInput ? decision.updatedInput : part.input;
    const providerId = getProviderConfigurationId(toolName, input);
    if (providerId) providerIds.add(providerId);
  }
  return [...providerIds];
}

export function mergeMessagesWithOverlay(
  messages: readonly Message[],
  overlayMessage?: Message,
): readonly Message[] {
  if (!overlayMessage) {
    return messages;
  }

  let didReplace = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== overlayMessage.id) {
      return message;
    }

    didReplace = true;
    return overlayMessage;
  });

  return didReplace ? nextMessages : [...nextMessages, overlayMessage];
}

function getProviderConfigurationId(toolName: string, input: unknown): string | undefined {
  if (toolName === CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME) {
    return configureBuiltinProviderInputSchema.safeParse(input).data?.provider || undefined;
  }
  if (toolName === CREATE_CUSTOM_PROVIDER_TOOL_NAME) {
    return createCustomProviderInputSchema.safeParse(input).data?.providerId || undefined;
  }
  return undefined;
}
