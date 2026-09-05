import { normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type ParseMcpHeadersResult = { ok: false } | { ok: true; value: Record<string, string> };

export function parseMcpHeaders(text: string): ParseMcpHeadersResult {
  const headers: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    const name = trimmedLine.slice(0, separatorIndex).trim();
    if (separatorIndex <= 0 || !HTTP_HEADER_NAME_PATTERN.test(name)) {
      return { ok: false };
    }

    headers[name] = trimmedLine.slice(separatorIndex + 1).trim();
  }

  return { ok: true, value: normalizeMcpHeaders(headers) };
}

export function serializeMcpHeaders(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
}
