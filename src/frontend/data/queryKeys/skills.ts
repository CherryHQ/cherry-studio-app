export const skillQueryKeys = {
  all: () => ['/skills'] as const,
  detail: (skillId: string) => [`/skills/${skillId}`] as const,
  agent: (agentId: string) => [`/agents/${agentId}/skills`] as const,
  recommended: () => ['skills', 'recommended'] as const,
};

export function isSkillQuery(queryKey: readonly unknown[]): boolean {
  const resource = queryKey[0];
  return (
    resource === 'skills' ||
    (typeof resource === 'string' && /^\/(?:skills(?:\/|$)|agents\/[^/]+\/skills$)/.test(resource))
  );
}
