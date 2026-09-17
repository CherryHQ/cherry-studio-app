export const OFFICE_DIAGNOSTIC_STAGES = [
  'read',
  'docx-render',
  'pptx-render',
  'pptx-slide',
  'pptx-node',
  'pptx-command',
  'xlsx-parse',
  'xlsx-images',
  'xlsx-warning',
  'chart-load',
  'react-render',
  'browser-error',
  'browser-rejection',
  'native-webview',
  'deadline',
  'bridge',
  'link',
] as const;

export type OfficeDiagnostic = {
  stage: (typeof OFFICE_DIAGNOSTIC_STAGES)[number];
  name: string;
  message: string;
  stack: string;
};

/** Bound diagnostic payloads before crossing the native bridge. Never include document bytes. */
export function officeDiagnostic(
  stage: OfficeDiagnostic['stage'],
  error: unknown,
): OfficeDiagnostic {
  return {
    stage,
    name: (error instanceof Error ? error.name : 'Error').slice(0, 100),
    message: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    stack: (error instanceof Error ? (error.stack ?? '') : '').slice(0, 4000),
  };
}
