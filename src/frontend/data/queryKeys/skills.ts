export function isSkillQuery(queryKey: readonly unknown[]): boolean {
  const resource = queryKey[0];
  return (
    typeof resource === 'string' && /^\/(?:skills(?:\/|$)|agents\/[^/]+\/skills$)/.test(resource)
  );
}
