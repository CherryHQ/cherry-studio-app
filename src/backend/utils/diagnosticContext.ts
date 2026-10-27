import {
  DiagnosticEventContextSchema,
  type DiagnosticEventContext,
} from '@/shared/data/types/diagnostics';

import { diagnosticIdentifier } from './diagnosticIdentifier';

let readContext: (() => DiagnosticEventContext) | undefined;

/** Bootstrap supplies synchronous, in-memory context; capture never restores credentials. */
export function installDiagnosticContextReader(read: () => DiagnosticEventContext): void {
  readContext = read;
}

/** Use at capture time only. Historical records must never acquire the exporting user's identity. */
export function readDiagnosticContext(): DiagnosticEventContext | undefined {
  try {
    return projectDiagnosticContext(readContext?.());
  } catch {
    // A missing context must not lose the diagnostic event or break its caller.
    return undefined;
  }
}

/** Apply the same allowlist before persistence and again at the archive boundary. */
export function projectDiagnosticContext(value: unknown): DiagnosticEventContext | undefined {
  const parsed = DiagnosticEventContextSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const entries = Object.entries(parsed.data).flatMap(([key, value]) => {
    const safe = typeof value === 'string' ? diagnosticIdentifier(value) : value;
    return safe === undefined ? [] : [[key, safe]];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}
