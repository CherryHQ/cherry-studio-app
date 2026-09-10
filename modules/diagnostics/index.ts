import { requireOptionalNativeModule } from 'expo';

type NativeDiagnostics = {
  saveFile(uri: string, name: string): Promise<string | null>;
  sha256(uri: string): Promise<string>;
  sign(value: string): Promise<string>;
  startCrashCapture(directory: string): void;
  cancelOperations(): void;
  identifyFile(uri: string): { size: number; modifiedAt: number; fileKey: string };
  upload(
    uri: string,
    name: string,
    description: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: string; invalidResponse: boolean }>;
};

export function getNativeDiagnostics(): NativeDiagnostics {
  const module = requireOptionalNativeModule<NativeDiagnostics>('CherryDiagnostics');
  if (!module) throw new Error('CherryDiagnostics requires a rebuilt development client');
  return module;
}
