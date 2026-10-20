import type { MessageListItem } from '@/frontend/components/Message';

/** Only structured failure attribution identifies the account that rejected the request. */
export function quotaFailureProviderIds(message: MessageListItem): string[] {
  if (message.role !== 'assistant' || message.status === 'pending') return [];
  const ids = new Set<string>();
  for (const part of message.data.parts ?? []) {
    if (part.type !== 'data-error' || part.data.reasonCode !== 'quota') continue;
    const context = part.data.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) continue;
    const providerId = context.providerId;
    if (typeof providerId === 'string' && providerId) ids.add(providerId);
  }
  return [...ids];
}
