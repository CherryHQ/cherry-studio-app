import type { AiUsagePurpose } from '@/shared/data/types/aiUsagePurpose';

const purposeKeys: Record<AiUsagePurpose, string> = {
  'conversation-response': 'aiUsage.purpose.conversationResponse',
  'context-compaction': 'aiUsage.purpose.contextCompaction',
  'session-naming': 'aiUsage.purpose.sessionNaming',
  translation: 'aiUsage.purpose.translation',
  'painting-generation': 'aiUsage.purpose.paintingGeneration',
  'image-response': 'aiUsage.purpose.imageResponse',
  'agent-image-tool': 'aiUsage.purpose.agentImageTool',
  'model-check': 'aiUsage.purpose.modelCheck',
};

export function getAiUsageInvocationPurposeKey(purpose: AiUsagePurpose | null): string {
  return purpose ? purposeKeys[purpose] : 'aiUsage.purpose.unknown';
}
