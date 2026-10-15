import { requireOptionalNativeModule } from 'expo';

type NativeDiagnostics = {
  readonly supportsShakeFeedback?: boolean;
  addListener(
    event: 'onAcceleration',
    listener: (sample: AccelerationSample) => void,
  ): { remove(): void };
  isUploadConfigured(): boolean;
  sha256(uri: string): Promise<string>;
  sign(value: string): Promise<string>;
  cancelOperations(): void;
  identifyFile(uri: string): { size: number; modifiedAt: number; fileKey: string };
  upload(
    uri: string,
    name: string,
    description: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: string; invalidResponse: boolean }>;
};

/** Acceleration including gravity, measured in g on both platforms. */
export type AccelerationSample = { x: number; y: number; z: number; timestamp: number };

export function supportsDiagnosticMotion(): boolean {
  return (
    requireOptionalNativeModule<NativeDiagnostics>('CherryDiagnostics')?.supportsShakeFeedback ===
    true
  );
}

export function observeDiagnosticMotion(listener: (sample: AccelerationSample) => void) {
  const module = requireOptionalNativeModule<NativeDiagnostics>('CherryDiagnostics');
  return module?.supportsShakeFeedback ? module.addListener('onAcceleration', listener) : undefined;
}

export function getNativeDiagnostics(): NativeDiagnostics {
  const module = requireOptionalNativeModule<NativeDiagnostics>('CherryDiagnostics');
  if (!module) throw new Error('CherryDiagnostics requires a rebuilt development client');
  return module;
}
