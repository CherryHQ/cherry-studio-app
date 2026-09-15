/** Bounded identifiers, excluding free text, URLs, absolute paths and recognizable credentials. */
export function diagnosticIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 160) return undefined;
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(value) ||
    value.includes('://') ||
    /^[a-z]:\//i.test(value)
  )
    return undefined;
  if (/(?:^|[^a-z0-9])(?:sk-|sk_|ghp_|github_pat_|gho_|ghu_|ghs_|ghr_|Bearer|eyJ)/i.test(value))
    return undefined;
  return value;
}
