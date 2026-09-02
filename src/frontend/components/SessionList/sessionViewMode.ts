export type SessionViewMode = 'agents' | 'sessions';

export function parseSessionViewMode(
  value: string | readonly string[] | undefined,
): SessionViewMode {
  const resolvedValue = Array.isArray(value) ? value[0] : value;

  return resolvedValue === 'agents' ? 'agents' : 'sessions';
}
