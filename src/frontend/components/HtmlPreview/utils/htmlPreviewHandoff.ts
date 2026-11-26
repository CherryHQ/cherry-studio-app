import { randomUUID } from 'expo-crypto';

/** The HTML the viewer opens next; source never enters URLs or saved navigation state. */
let current: { token: string; source: string } | undefined;

export function createHtmlPreviewHandoff(source: string): string {
  const token = randomUUID();
  current = { token, source };
  return token;
}

export function readHtmlPreviewHandoff(token: string | undefined): string | undefined {
  return token && current?.token === token ? current.source : undefined;
}
