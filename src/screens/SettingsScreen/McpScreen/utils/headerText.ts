export function parseHeaderText(value: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf('=');
    if (!line || line.startsWith('#') || separatorIndex <= 0) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim();
    if (name) {
      headers[name] = line.slice(separatorIndex + 1).trim();
    }
  }

  return headers;
}

export function serializeHeaders(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
}
