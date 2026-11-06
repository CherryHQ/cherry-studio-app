import { randomUUID } from 'expo-crypto';

/** The diagram the viewer opens next; source never enters URLs or saved navigation state. */
let current: { token: string; source: string } | undefined;

export function createMermaidViewerHandoff(source: string): string {
  const token = randomUUID();
  current = { token, source };
  return token;
}

export function readMermaidViewerHandoff(token: string | undefined): string | undefined {
  return token && current?.token === token ? current.source : undefined;
}
