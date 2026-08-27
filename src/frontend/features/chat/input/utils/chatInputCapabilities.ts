import { splitToolMentions } from '@/frontend/utils/toolMentions';
import type { AgentTemporaryCapability } from '@/shared/contracts/agent';

export function getChatInputTemporaryCapabilities(input: {
  isWebSearchEnabled: boolean;
  text: string;
}): AgentTemporaryCapability[] {
  const capabilities: AgentTemporaryCapability[] = [];

  if (input.isWebSearchEnabled) {
    capabilities.push('web-search');
  }
  if (splitToolMentions(input.text).some((segment) => segment.id === 'create-image')) {
    capabilities.push('image-generation');
  }

  return capabilities;
}
