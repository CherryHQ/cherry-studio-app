export type ProviderRuntimeDiagnostic = {
  code:
    | 'model-list-failed'
    | 'optional-model-list-failed'
    | 'vertex-auth-failed'
    | 'vertex-config-invalid'
    | 'vertex-publisher-failed';
  endpoint?: string;
  error: unknown;
  providerId: string;
  publisher?: string;
};

export type ProviderRuntimeDiagnostics = (diagnostic: ProviderRuntimeDiagnostic) => void;

export function emitProviderRuntimeDiagnostic(
  diagnostics: ProviderRuntimeDiagnostics | undefined,
  diagnostic: ProviderRuntimeDiagnostic,
): void {
  try {
    diagnostics?.(diagnostic);
  } catch {
    // Diagnostics must never alter provider behavior.
  }
}
