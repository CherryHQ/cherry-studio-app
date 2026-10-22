/** Serializable controls for a single pending decision on a system surface. */
export type { BackgroundActivityActions } from '@cherrystudio/ui/background-activity';

export type BackgroundActivityActionResponse = {
  token: string;
  actionId: string;
  text?: string;
};

export const BACKGROUND_REPLY_ACTION = 'reply';

export function parseBackgroundActivityAction(
  value: unknown,
): BackgroundActivityActionResponse | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.token !== 'string' || typeof item.actionId !== 'string') return undefined;
  if (item.text !== undefined && typeof item.text !== 'string') return undefined;
  return {
    token: item.token,
    actionId: item.actionId,
    ...(typeof item.text === 'string' ? { text: item.text } : {}),
  };
}
