export type ParseHeaderTextResult =
  | { headers: Record<string, string>; ok: true }
  | { line: number; ok: false };

export function parseHeaderText(value: string): ParseHeaderTextResult {
  const headers: Record<string, string> = {};

  const lines = value.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      return { line: index + 1, ok: false };
    }

    const name = line.slice(0, separatorIndex).trim();
    if (!name) {
      return { line: index + 1, ok: false };
    }
    headers[name] = line.slice(separatorIndex + 1).trim();
  }

  return { headers, ok: true };
}

export function serializeHeaders(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
}
