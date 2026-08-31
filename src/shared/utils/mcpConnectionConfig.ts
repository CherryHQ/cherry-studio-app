type McpConnectionConfigLike = {
  endpointUrl: string;
  headers?: Readonly<Record<string, string>>;
};

export function normalizeMcpHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  const nameByLowercase = new Map<string, string>();

  for (const [name, value] of Object.entries(headers ?? {})) {
    const lowercaseName = name.toLowerCase();
    const previousName = nameByLowercase.get(lowercaseName);
    if (previousName !== undefined) {
      delete normalized[previousName];
    }
    nameByLowercase.set(lowercaseName, name);
    normalized[name] = value;
  }

  return normalized;
}

export function isSameMcpConnectionConfig(
  left: McpConnectionConfigLike,
  right: McpConnectionConfigLike,
): boolean {
  if (left.endpointUrl !== right.endpointUrl) {
    return false;
  }

  const leftHeaders = normalizeMcpHeaders(left.headers);
  const rightHeaders = normalizeMcpHeaders(right.headers);
  const leftNames = Object.keys(leftHeaders);
  const rightByLowercase = new Map(
    Object.entries(rightHeaders).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return (
    leftNames.length === rightByLowercase.size &&
    leftNames.every((name) => rightByLowercase.get(name.toLowerCase()) === leftHeaders[name])
  );
}
